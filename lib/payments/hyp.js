/**
 * Hyp Pay: turning an order into a hosted payment page.
 *
 * **The only place the payment credentials are read**, and server-side only.
 * Named for the provider rather than the job — unlike `lib/translate.js` and
 * `lib/image-host.js` — because unlike those two this one cannot be swapped
 * without a decision: the flow below, the parameter names and the signature
 * mechanism are Hyp's, and a module called `payments.js` would be pretending
 * otherwise. See .claude/rules/api.md.
 *
 * **We do not compute the signature. Hyp does.** That is the single most
 * surprising thing about this integration and the reason this file is shaped the
 * way it is:
 *
 *   1. We GET `…/p/?action=APISign&What=SIGN&…` with our parameters.
 *   2. Hyp answers with a URL-encoded query string that already contains
 *      `action=pay` and a `signature=…` it calculated.
 *   3. We append that answer **verbatim** to `…/p/?` and send the buyer there.
 *
 * So there is no HMAC here, and **the response is never parsed and rebuilt.**
 * Re-ordering it, re-encoding it, or dropping a parameter invalidates the
 * signature Hyp just produced. It is treated as an opaque string, and the only
 * thing read out of it is whether it looks like a signed answer at all.
 *
 * **It never throws.** A missing key, a refused key, a timeout, an HTML error
 * page and a declined signature all come back as `{ ok: false, error }` with a
 * code the checkout says in Hebrew. A payment provider having a bad afternoon
 * must not be an unhandled exception in front of a buyer holding a card.
 *
 * **Amounts arrive in agorot and leave as the provider's decimal shekels.** That
 * is the one conversion in this file and the only place it happens on the
 * charging path: `orders-repository.js` computes the total in agorot from
 * `price_agorot`, and this turns it into the string Hyp's `Amount` expects.
 * Display conversion lives in the works repository and is a different journey
 * from the same stored integer — neither derives from the other.
 */

/** Hyp's single endpoint. The same host for test and production; only the credentials differ. */
const HYP_ENDPOINT = 'https://pay.hyp.co.il/p/';

/**
 * Where requests actually go.
 *
 * **This is a development-only testing seam, and it is written this way on
 * purpose rather than hidden.** Hyp uses one host for test and production, so
 * there is no sandbox to point at — and until the artist's account exists there
 * are no credentials at all, which means the entire return path (verify, seize,
 * mark paid, clear the cart) could otherwise not be exercised even once before
 * it is in front of a real buyer. `HYP_ENDPOINT_OVERRIDE` lets a local stand-in
 * answer VERIFY so that path can be driven end to end.
 *
 * **It is refused outright in production**, and that is the whole of its safety:
 * an override read in production would mean an attacker who could set one
 * environment variable could answer "this payment is genuine" on our behalf.
 * `NODE_ENV` is `production` in a Netlify deploy preview as well as on the live
 * site, so this is off everywhere that is not somebody's laptop.
 *
 * Delete it the day there is a test terminal to point at. It buys exactly one
 * thing — proof before credentials — and it stops being worth anything after.
 */
function endpoint() {
  if (process.env.NODE_ENV === 'production') return HYP_ENDPOINT;

  return process.env.HYP_ENDPOINT_OVERRIDE || HYP_ENDPOINT;
}

/**
 * Test terminal numbers begin with this, per Hyp's own documentation.
 *
 * It is what lets the guard below exist: "use the test environment" is not a
 * different URL on this provider, it is a different terminal number, so nothing
 * about the request shape reveals which one you are about to charge.
 */
const TEST_TERMINAL_PREFIX = '00100';

/** Long enough for a server-to-server call, short enough that a form does not hang. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Reads the three credentials as a set.
 *
 * As a set deliberately, like the Cloudinary keys: two out of three is a
 * misconfiguration that would otherwise surface as a refusal from Hyp that
 * nobody can act on.
 */
function readCredentials() {
  const masof = process.env.HYP_TERMINAL_NUMBER;
  const key = process.env.HYP_API_KEY;
  const password = process.env.HYP_API_PASSWORD;

  if (!masof || !key || !password) return null;

  return { masof, key, password };
}

/**
 * Whether payment is configured at all.
 *
 * The checkout page asks this and leaves the payment step out entirely rather
 * than offering a control that fails — the same arrangement
 * `isTranslationConfigured()` gives the admin work form. An absent feature is
 * honest; a button that dies on submit is not.
 *
 * @returns {boolean}
 */
export function isHypConfigured() {
  return readCredentials() !== null;
}

/**
 * Whether the configured terminal is one of Hyp's test terminals.
 *
 * Exported so a non-production surface can say so on the page. A buyer must
 * never be left guessing whether a charge was real, and on a preview deployment
 * that question is otherwise unanswerable from the outside.
 *
 * @returns {boolean}
 */
export function isTestTerminal() {
  const credentials = readCredentials();
  return credentials ? credentials.masof.startsWith(TEST_TERMINAL_PREFIX) : false;
}

/**
 * Maps a site locale to Hyp's page language.
 *
 * Hyp takes `HEB` or `ENG`, which is not our locale vocabulary, so the mapping
 * lives here rather than leaking a provider's spelling into the application. An
 * unknown locale falls back to Hebrew, which is the site default and Hyp's.
 */
function pageLanguage(locale) {
  return locale === 'en' ? 'ENG' : 'HEB';
}

/**
 * Splits one name field into the two Hyp wants.
 *
 * We ask the buyer for a name, once, because `orders.buyer_name` is one column
 * and because two boxes for a name is a form asking a question it does not need
 * the answer to. Hyp wants first and last separately, so the first whitespace is
 * the seam: everything before it is the given name, everything after is the rest.
 * A single-word name sends a given name and no surname, which is correct rather
 * than a failure.
 */
function splitName(name) {
  const trimmed = String(name ?? '').trim();
  const seam = trimmed.search(/\s/);

  if (seam === -1) return { first: trimmed, last: '' };

  return { first: trimmed.slice(0, seam), last: trimmed.slice(seam + 1).trim() };
}

/**
 * Agorot to the decimal string Hyp's `Amount` expects.
 *
 * Integer arithmetic, then a string — never a float divided and formatted by a
 * locale, which is how 1040 becomes "1,040.00" and a provider rejects it.
 */
function toAmountParameter(agorot) {
  const shekels = Math.trunc(agorot / 100);
  const remainder = Math.abs(agorot % 100);

  return shekels + '.' + String(remainder).padStart(2, '0');
}

/**
 * Asks Hyp to sign a payment page, and returns the URL to send the buyer to.
 *
 * @param {object} input
 * @param {number} input.totalAgorot - What will be charged, delivery included.
 *   Computed by `orders-repository.js`; never a figure from a browser.
 * @param {string} input.orderReference - Our order's id, which is its public
 *   reference. It comes back on the redirect and is how the return finds the row.
 * @param {{name: string, email: string, phone: string}} input.buyer
 * @param {string} input.locale
 * @param {string} input.info - A short human description for the payment page
 *   and Hyp's own records. A sentence the caller has already translated; no
 *   user-facing copy lives in this module.
 * @returns {Promise<{ok: true, url: string} | {ok: false, error: string}>}
 *   Error codes: `notConfigured`, `liveTerminalInDevelopment`, `network`,
 *   `timeout`, `systemError`, `refused`.
 */
export async function createPaymentPage({ totalAgorot, orderReference, buyer, locale, info }) {
  const credentials = readCredentials();
  if (!credentials) return { ok: false, error: 'notConfigured' };

  /*
    The rail that stops a production terminal being charged from a laptop. It is
    deliberately a refusal rather than a warning: the failure it prevents is a
    real card being charged during a test, which is not recoverable by noticing
    it afterwards.

    Note what it does NOT cover: a deploy preview builds with NODE_ENV=production,
    so this cannot tell one from the live site. That is a deployment task — the
    preview context gets the test terminal's credentials — and it is written down
    in deployment.md rather than guessed at here.
  */
  if (process.env.NODE_ENV !== 'production' && !isTestTerminal()) {
    console.error(
      '[hyp] refusing to sign: HYP_TERMINAL_NUMBER is not a test terminal ' +
        '(test terminals start with ' + TEST_TERMINAL_PREFIX + ') and this is not production.'
    );
    return { ok: false, error: 'liveTerminalInDevelopment' };
  }

  const { first, last } = splitName(buyer.name);

  /*
    URLSearchParams percent-encodes every value, which is the whole of the
    Hebrew story: `info` and a buyer's name arrive as UTF-8 and leave as
    percent-encoded UTF-8 bytes, which is what Hyp's own documented examples
    show. There is deliberately no UTF8/UTF8out parameter here — the docs place
    those under other API actions, and an undocumented parameter would be echoed
    into the signed response and sent on to the payment page.
  */
  const request = new URLSearchParams({
    action: 'APISign',
    What: 'SIGN',
    /* Asks Hyp to sign, so the redirect back can be validated with VERIFY. */
    Sign: 'True',
    /* The extended response fields. */
    MoreData: 'True',
    Masof: credentials.masof,
    KEY: credentials.key,
    PassP: credentials.password,
    Amount: toAmountParameter(totalAgorot),
    /* 1 is ILS. Stated rather than left to the default, because the default is
       a thing that can change and a currency is not worth assuming. */
    Coin: '1',
    Order: orderReference,
    Info: info,
    ClientName: first,
    ClientLName: last,
    email: buyer.email,
    /* Hyp's parameter for a mobile number is `cell`, not `phone`. */
    cell: buyer.phone,
    PageLang: pageLanguage(locale),
  });

  let response;

  try {
    response = await fetch(endpoint() + '?' + request.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      /* Nothing about a signing request is cacheable. */
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error('[hyp] sign request failed', error);
    return { ok: false, error: timedOut ? 'timeout' : 'network' };
  }

  let body;

  try {
    body = (await response.text()).trim();
  } catch (error) {
    console.error('[hyp] could not read sign response', error);
    return { ok: false, error: 'network' };
  }

  /*
    An HTML body means a system error at the provider rather than a declined
    request — their documented behaviour, and it is why this cannot be judged by
    status code. It is the "we do not know" case.
  */
  if (!response.ok || body.startsWith('<') || body.toLowerCase().includes('<html')) {
    console.error('[hyp] sign returned a system error', {
      status: response.status,
      body: body.slice(0, 400),
    });
    return { ok: false, error: 'systemError' };
  }

  /*
    A signed answer carries the signature Hyp calculated. Anything else — a bare
    CCode, an empty body — is a refusal, and the detail goes to the log rather
    than to the buyer. The body is NOT parsed into a structure and rebuilt: it is
    appended exactly as it arrived, because its parameter order is part of what
    the signature covers.
  */
  if (!body.includes('signature=')) {
    console.error('[hyp] sign refused', { body: body.slice(0, 400) });
    return { ok: false, error: 'refused' };
  }

  return { ok: true, url: endpoint() + '?' + body };
}

/* ------------------------------------------------------------------ *
 * The way back
 *
 * Everything below is about a buyer's browser arriving at one of our return
 * URLs. On this tier that redirect is the ONLY completion signal there is —
 * no webhook, no status query — so what follows is the whole of how this
 * application learns that money moved. See api.md.
 * ------------------------------------------------------------------ */

/**
 * Reads Hyp's answer to a VERIFY (or a cancellation) and says what it means.
 *
 * **Pure, and exported, because it is the piece worth testing exhaustively.**
 * Every judgement about a provider response is made here, so the rules can be
 * exercised without a network, without credentials, and without Hyp existing.
 *
 * Three rules, and each is a documented way to get this wrong:
 *
 * - **`CCode` decides, never the HTTP status.** A 200 carrying a failure code is
 *   a failure. The status is consulted only to notice a server that fell over
 *   entirely.
 * - **An HTML body is a system error, not a decline.** It means something broke
 *   at the provider, which is the "we do not know" case — and "we do not know"
 *   must never be filed as "the payment failed", because the money may well have
 *   moved.
 * - **Anything unreadable is a failure.** An empty body, a body with no `CCode`,
 *   a body that is not a query string at all: none of them is evidence of a
 *   successful payment, and the safe direction here is only ever downwards.
 *
 * @param {number} status - HTTP status.
 * @param {string} body - The raw response body.
 * @returns {{ok: true, ccode: string, fields: Record<string, string>}
 *          | {ok: false, error: 'systemError'|'declined'|'unreadable', ccode?: string}}
 */
export function interpretVerifyResponse(status, body) {
  const text = String(body ?? '').trim();

  /*
    HTML first, before anything tries to parse it as a query string — a page of
    markup will happily produce nonsense parameters otherwise.
  */
  if (text.startsWith('<') || text.toLowerCase().includes('<html')) {
    return { ok: false, error: 'systemError' };
  }

  if (status >= 500 || text === '') return { ok: false, error: 'systemError' };

  const fields = Object.fromEntries(new URLSearchParams(text));
  const ccode = fields.CCode;

  if (ccode === undefined) return { ok: false, error: 'unreadable' };

  /*
    Zero is the only success, compared as a string against the exact value rather
    than parsed — so '00', ' 0' and '' cannot become a successful payment through
    a helpful coercion.
  */
  if (ccode === '0') return { ok: true, ccode, fields };

  return { ok: false, error: 'declined', ccode };
}

/**
 * Validates a return from the payment page with Hyp's VERIFY call.
 *
 * **Nothing in the redirect is believed until this answers.** The parameters
 * arrive in a URL the buyer can edit, so on their own they are evidence that a
 * transaction *may* have happened and nothing more — not an amount, not a
 * status, not an order.
 *
 * **The query is replayed verbatim, in its original order.** That is the trap
 * this function exists around: Hyp signs over the parameters as they were sent,
 * so rebuilding the query from named fields, sorting it, or re-encoding it fails
 * the check for reasons nothing in the response explains. The caller hands over
 * the raw query string and it is appended untouched.
 *
 * **Missing credentials are `cannotVerify`, and that is not a failure code by
 * accident.** With no account there is no way to ask, so the honest answer is
 * "we do not know" — and it must reach the caller as its own outcome rather than
 * collapsing into either a success or a decline. A payment nobody could check
 * leaves the order exactly as it was.
 *
 * @param {string} rawQuery - The return URL's query string, without the leading
 *   `?`, exactly as it arrived.
 * @returns {Promise<{ok: true, ccode: string, fields: Record<string, string>}
 *          | {ok: false, error: string, ccode?: string}>}
 */
export async function verifyReturn(rawQuery) {
  const credentials = readCredentials();

  if (!credentials) {
    console.error('[hyp] cannot verify a return: no credentials configured');
    return { ok: false, error: 'cannotVerify' };
  }

  if (!rawQuery) return { ok: false, error: 'unreadable' };

  /*
    Ours first, then theirs verbatim. The three credentials and the two action
    parameters authorise the question; everything after the join is the redirect
    exactly as the browser presented it.

    Worth knowing before this meets a real terminal: if Hyp's return ever carries
    its own `action`, `Masof`, `KEY`, `PassP` or `What`, this produces a duplicate
    key and the pairing has to be revisited. The documented return fields are
    transaction results — `Id`, `CCode`, `Amount`, `ACode`, `Order`, the card and
    buyer echoes, `signature` — and contain none of them, so this is the shape the
    documentation describes. It is unproven until there is an account to prove it
    against.
  */
  const auth = new URLSearchParams({
    action: 'APISign',
    What: 'VERIFY',
    Masof: credentials.masof,
    KEY: credentials.key,
    PassP: credentials.password,
  });

  return requestAndInterpret(auth.toString() + '&' + rawQuery, 'verify');
}

/**
 * Asks Hyp to void a transaction on the day it was taken, before settlement.
 *
 * **This is the apology path**, and it runs in exactly one situation: a buyer
 * paid for a painting that was sold to somebody else in the seconds between
 * their order being written and their payment being verified. Every painting is
 * a one-off, so there is nothing to ship and the money has to go back. Voiding
 * the same day is cleaner than a refund for both sides — it never reaches the
 * card statement at all.
 *
 * **Two things about it are deliberately conspicuous rather than tidy.**
 *
 * First, `CancelTrans` is the same-day call and `zikoyAPI` is the refund for any
 * other day. Only the first is built. A failure here is not a dead end: the
 * caller records that a refund is owed and the artist makes it by hand. The
 * money is never silently kept.
 *
 * Second — and this is the one to read before the first real transaction —
 * **the exact parameter naming for the transaction id is unconfirmed.** The
 * documentation names the action; which of `TransId` / `Id` / `transId` carries
 * the transaction has never been seen against a live terminal, because there has
 * never been one. `TransId` is what the cancellation documentation uses, and
 * this docblock is the flag for whoever runs the first real void. Everything
 * around it — when it fires, what happens when it fails, what the buyer is told
 * — is proven. This one field name is not.
 *
 * @param {object} input
 * @param {string} input.transactionId - Hyp's own id for the transaction, taken
 *   from the verified return's `Id`.
 * @returns {Promise<{ok: true, ccode: string, fields: object}
 *          | {ok: false, error: string, ccode?: string}>}
 */
export async function cancelTransaction({ transactionId }) {
  const credentials = readCredentials();

  if (!credentials) return { ok: false, error: 'cannotVerify' };
  if (!transactionId) return { ok: false, error: 'unreadable' };

  const request = new URLSearchParams({
    action: 'CancelTrans',
    Masof: credentials.masof,
    KEY: credentials.key,
    PassP: credentials.password,
    TransId: transactionId,
  });

  return requestAndInterpret(request.toString(), 'cancel');
}

/**
 * The one place a request leaves this server on the return path.
 *
 * Shared by VERIFY and by the cancellation so both judge a response the same way
 * and both fail the same way. Like everything else here it never throws: a
 * timeout, a refused connection and a provider outage are all codes.
 */
async function requestAndInterpret(query, label) {
  let response;

  try {
    response = await fetch(endpoint() + '?' + query, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error('[hyp] ' + label + ' request failed', error);
    return { ok: false, error: timedOut ? 'timeout' : 'network' };
  }

  let body;

  try {
    body = await response.text();
  } catch (error) {
    console.error('[hyp] could not read the ' + label + ' response', error);
    return { ok: false, error: 'network' };
  }

  const result = interpretVerifyResponse(response.status, body);

  if (!result.ok) {
    /* The detail goes to the log; the buyer is told something they can act on. */
    console.error('[hyp] ' + label + ' did not succeed', {
      error: result.error,
      ccode: result.ccode,
      status: response.status,
      body: body.slice(0, 400),
    });
  }

  return result;
}
