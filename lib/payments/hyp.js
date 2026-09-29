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

/*
  Reads the terminal's credentials, so importing it from a client component must
  fail the build rather than ship them. The endpoint lives in hyp-endpoint.js,
  which reads nothing, because next.config.mjs needs it and loads outside React's
  server environment.
*/
import 'server-only';
import { HYP_ENDPOINT } from './hyp-endpoint.js';

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
 * The provider's decimal `Amount` back to agorot — the inverse of the above,
 * and the only other conversion on the payment path.
 *
 * **Strict, because what it answers is whether a buyer paid the right amount.**
 * Whole shekels with no leading zero, then at most two decimals: `1040`,
 * `1040.5` and `1040.50` all read. Hyp's own documented redirect sends `10`
 * with no decimals at all, and we send `1040.00`, so both shapes must.
 * Anything else — a sign, a thousands separator, a third decimal, a space, an
 * exponent — is `null`, and the caller treats `null` as a mismatch: the payment
 * is voided rather than a guess being settled.
 *
 * **No floating point anywhere.** The digits are split as text and joined as
 * integers, so `1040.10` cannot become 104009 through a binary fraction.
 *
 * @param {string|null|undefined} value
 * @returns {number|null} agorot, or null when the value is not a plain amount.
 */
export function parseAmountParameter(value) {
  if (typeof value !== 'string') return null;

  const match = /^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) return null;

  const [, shekels, fraction = ''] = match;

  return Number(shekels) * 100 + Number(fraction.padEnd(2, '0'));
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
 *   Error codes: `notConfigured`, `liveTerminalInDevelopment`,
 *   `testTerminalInProduction`, `network`, `timeout`, `systemError`, `refused`.
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

  /*
    The same rail, facing the other way. A test terminal on the live site takes
    no real money — a buyer would walk through a payment that charged nothing
    and be sent a painting. So production refuses one unless somebody has said,
    in so many words, that this is the pre-launch test: `HYP_ALLOW_TEST_TERMINAL`
    set to exactly `true`. It exists for that one walk-through on the real
    domain and comes off with `HYP_ENDPOINT_OVERRIDE` before launch — see the
    checklist in deployment.md.
  */
  if (
    process.env.NODE_ENV === 'production' &&
    isTestTerminal() &&
    process.env.HYP_ALLOW_TEST_TERMINAL !== 'true'
  ) {
    console.error(
      '[hyp] refusing to sign: HYP_TERMINAL_NUMBER is a test terminal in production, ' +
        'and HYP_ALLOW_TEST_TERMINAL is not set to true.'
    );
    return { ok: false, error: 'testTerminalInProduction' };
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
 * Keys a return may never carry, compared without regard to case.
 *
 * They are the five that authorise a VERIFY — ours, sent in front of the
 * redirect. Hyp's endpoint most likely keeps the **last** value of a repeated
 * key, so a return carrying `What=SIGN` or its own `Masof` would not be a
 * harmless extra: it would change the question Hyp is asked, after our half has
 * been written.
 */
const RESERVED_RETURN_KEYS = new Set(['action', 'what', 'masof', 'key', 'passp']);

/**
 * What a return key may look like: letters, digits and underscore.
 *
 * Every field Hyp documents on the way back — `Id`, `CCode`, `Amount`, `ACode`,
 * `Order`, `Fild1`, `Sign` and the rest — fits. The rule exists for the keys
 * that do not: a parser on the other end may trim ` Masof`, fold `Mas.of`, or
 * read `Masof[0]` as `Masof`, and each of those would walk a reserved key past
 * the check above. Refusing anything but a plain name closes that whole family
 * without having to know which parser Hyp runs.
 */
const RETURN_KEY_SHAPE = /^[A-Za-z0-9_]+$/;

/**
 * The gate a return passes before VERIFY is ever asked about it.
 *
 * **Pure and exported**, like the judgements below, so every refusal can be
 * exercised without a network.
 *
 * It refuses a query that is empty, contains a `;` (raw, or in any decoded
 * value), repeats a key (again without regard to case), carries a reserved key,
 * or carries a key of any other shape. **It is a gate, not a rewrite**: the
 * query is parsed here only to be inspected, and what goes to VERIFY is the
 * string the handler was given, in its original order — Hyp signs over the
 * parameters in their order, so rebuilding them fails the check.
 *
 * Refusing a repeated key is also what makes reading the return afterwards
 * safe: with one value per key there is nothing for Hyp's parser and ours to
 * disagree about.
 *
 * **If a real terminal's return ever carries one of these keys**, every payment
 * is refused and the order stays pending — which the pre-launch test will show,
 * and which is the safe way for this to be wrong.
 *
 * @param {string} rawQuery - Without the leading `?`.
 * @returns {{ok: true} | {ok: false, error: 'empty'|'semicolon'|'malformedKey'|'duplicateKey'|'reservedKey', key?: string}}
 */
export function checkReturnQuery(rawQuery) {
  if (!rawQuery) return { ok: false, error: 'empty' };

  /*
    A semicolon, raw or inside a decoded value. Some server stacks split a
    query on `;` as well as `&`, and if Hyp's does, `Fild3=x;Masof=…` hides a
    reserved key inside a value that the loop below — which splits on `&` only
    — sees as harmless.

    **Both forms, because Next decides which one arrives.** A raw `;` in the
    request line reaches a route handler already re-encoded as `%3B` (measured
    on 28-09-2026; see handle-return.js), so checking the raw string alone
    would pass it. As `%3B` it is data to every parser — but this should not
    depend on how a framework happens to re-encode, and no documented redirect
    field carries a semicolon.
  */
  if (rawQuery.includes(';')) return { ok: false, error: 'semicolon' };
  for (const [, value] of new URLSearchParams(rawQuery)) {
    if (value.includes(';')) return { ok: false, error: 'semicolon' };
  }

  const seen = new Set();
  let count = 0;

  for (const [key] of new URLSearchParams(rawQuery)) {
    count += 1;

    if (!RETURN_KEY_SHAPE.test(key)) return { ok: false, error: 'malformedKey', key };

    const folded = key.toLowerCase();

    if (RESERVED_RETURN_KEYS.has(folded)) return { ok: false, error: 'reservedKey', key };
    if (seen.has(folded)) return { ok: false, error: 'duplicateKey', key };

    seen.add(folded);
  }

  if (count === 0) return { ok: false, error: 'empty' };

  return { ok: true };
}

/**
 * Reads a provider answer and says whether it is a success at all.
 *
 * **Pure, and exported, because it is the piece worth testing exhaustively.**
 * Shared by VERIFY and the cancellation, so both are judged by the same rules:
 *
 * - **`CCode` decides, never the HTTP status.** A 200 carrying a failure code is
 *   a failure. The status is consulted only to notice a server that fell over
 *   entirely.
 * - **An HTML body is a system error, not a decline.** It means something broke
 *   at the provider, which is the "we do not know" case — and "we do not know"
 *   must never be filed as "the payment failed", because the money may well have
 *   moved.
 * - **Anything unreadable is a failure.** An empty body, a body with no `CCode`,
 *   a body carrying two of them, a body that is not a query string at all: none
 *   of them is evidence of anything, and the safe direction here is only ever
 *   downwards.
 *
 * @param {number} status - HTTP status.
 * @param {string} body - The raw response body.
 * @returns {{ok: true, ccode: string, fields: Record<string, string>}
 *          | {ok: false, error: 'systemError'|'declined'|'unreadable', ccode?: string}}
 */
export function interpretProviderResponse(status, body) {
  const text = String(body ?? '').trim();

  /*
    HTML first, before anything tries to parse it as a query string — a page of
    markup will happily produce nonsense parameters otherwise.
  */
  if (text.startsWith('<') || text.toLowerCase().includes('<html')) {
    return { ok: false, error: 'systemError' };
  }

  if (status >= 500 || text === '') return { ok: false, error: 'systemError' };

  const params = new URLSearchParams(text);
  const ccodes = params.getAll('CCode');

  /* Two answers in one body is not an answer. */
  if (ccodes.length !== 1) return { ok: false, error: 'unreadable' };

  const [ccode] = ccodes;

  /*
    Zero is the only success, compared as a string against the exact value rather
    than parsed — so '00', ' 0' and '' cannot become a successful payment through
    a helpful coercion.
  */
  if (ccode === '0') return { ok: true, ccode, fields: Object.fromEntries(params) };

  return { ok: false, error: 'declined', ccode };
}

/**
 * Keys that belong to a SIGN answer and never to a VERIFY one.
 *
 * A signed payment page comes back as `…&action=pay&…&signature=…`, carrying the
 * terminal number as well. VERIFY answers `CCode=0` and nothing else. So an
 * answer holding any of these is the wrong kind of answer — which is exactly
 * what a return smuggling `What=SIGN` past us would produce. Hyp's documented
 * SIGN answer carries no `CCode` at all and would already fail as unreadable;
 * this check is for the day one does, so that "some answer said CCode=0" can
 * never be mistaken for "VERIFY said the signature is genuine".
 */
const SIGN_ANSWER_KEYS = new Set(['signature', 'action', 'masof']);

/**
 * Reads Hyp's answer to a VERIFY.
 *
 * Everything `interpretProviderResponse` requires, and one thing more: **the
 * answer has the VERIFY shape.** `CCode` exactly `'0'` and none of the keys a
 * SIGN answer carries. A success of the wrong kind is not a success.
 *
 * Note what a success here means, because it is narrower than it sounds: **Hyp's
 * signature over the redirect is genuine.** It is not a statement that a payment
 * went through, and it carries no transaction id — both of those are in the
 * redirect itself, which this answer has just authenticated. See
 * `readSignedReturn`.
 *
 * @param {number} status
 * @param {string} body
 * @returns {{ok: true, ccode: string, fields: Record<string, string>}
 *          | {ok: false, error: 'systemError'|'declined'|'unreadable'|'notAVerifyAnswer', ccode?: string}}
 */
export function interpretVerifyResponse(status, body) {
  const result = interpretProviderResponse(status, body);
  if (!result.ok) return result;

  const foreign = Object.keys(result.fields).find((key) => SIGN_ANSWER_KEYS.has(key.toLowerCase()));

  if (foreign) return { ok: false, error: 'notAVerifyAnswer' };

  return result;
}

/**
 * Validates a return from the payment page with Hyp's VERIFY call.
 *
 * **Before this answers, nothing in the redirect is believed.** The parameters
 * arrive in a URL the buyer can edit, so on their own they are evidence that a
 * transaction *may* have happened and nothing more.
 *
 * **The gate runs first, here rather than in the caller**, so that no path can
 * send VERIFY a query carrying one of our own keys or a key twice.
 *
 * **The query is appended exactly as the caller hands it over, in its original
 * order.** Hyp signs over the parameters as they were sent, so rebuilding the
 * query from named fields or sorting it fails the check for reasons nothing in
 * the response explains. Note that what the caller has is not always Hyp's
 * bytes: Next re-encodes a request's query before a route handler sees it —
 * see handle-return.js — so the values arrive intact and their encoding may
 * not.
 *
 * **Missing credentials are `cannotVerify`**, and that is its own outcome
 * rather than a decline: with no account there is no way to ask, so the honest
 * answer is "we do not know", and a payment nobody could check leaves the order
 * exactly as it was.
 *
 * @param {string} rawQuery - The return URL's query string, without the leading
 *   `?`, as the handler received it.
 * @returns {Promise<{ok: true, ccode: string, fields: Record<string, string>}
 *          | {ok: false, error: string, ccode?: string, key?: string}>}
 */
export async function verifyReturn(rawQuery) {
  const gate = checkReturnQuery(rawQuery);

  if (!gate.ok) return { ok: false, error: 'refusedQuery:' + gate.error, key: gate.key };

  const credentials = readCredentials();

  if (!credentials) {
    console.error('[hyp] cannot verify a return: no credentials configured');
    return { ok: false, error: 'cannotVerify' };
  }

  /*
    Ours first, then theirs untouched. The three credentials and the two action
    parameters authorise the question; everything after the join is the redirect
    as the handler received it — and the gate above has already guaranteed it
    names none of these five and repeats nothing.
  */
  const auth = new URLSearchParams({
    action: 'APISign',
    What: 'VERIFY',
    Masof: credentials.masof,
    KEY: credentials.key,
    PassP: credentials.password,
  });

  return requestAndInterpret(auth.toString() + '&' + rawQuery, 'verify', interpretVerifyResponse);
}

/**
 * What a return says, **once VERIFY has said it is Hyp's**.
 *
 * Before verification these parameters are nothing — a URL anyone can type.
 * After it they are Hyp's signed statement: its signature covered them, and
 * VERIFY has just confirmed that signature. That is why they may be read at all,
 * and why this must never be called on a return that has not been verified.
 *
 * The gate has already refused any repeated key, so each of these has exactly
 * one value and there is no question of which one Hyp read.
 *
 * - `ccode` — the payment's own outcome. `'0'` is a charge.
 * - `order` — our order id, which we sent and Hyp signed back.
 * - `amountAgorot` — what was charged, or null when it is not a plain amount.
 * - `transactionId` — Hyp's `Id`: the transaction's name for the record and for
 *   a void. Null when absent.
 *
 * @param {string} rawQuery
 * @returns {{ccode: string|null, order: string|null, amountRaw: string|null,
 *            amountAgorot: number|null, transactionId: string|null}}
 */
export function readSignedReturn(rawQuery) {
  const params = new URLSearchParams(rawQuery);
  const amountRaw = params.get('Amount');

  return {
    ccode: params.get('CCode'),
    order: params.get('Order'),
    amountRaw,
    amountAgorot: parseAmountParameter(amountRaw),
    transactionId: params.get('Id') || null,
  };
}

/**
 * Asks Hyp to void a transaction on the day it was taken, before settlement.
 *
 * **This is the apology path.** It runs when money moved for something we did
 * not sell: a buyer paid for a painting that went to somebody else in the
 * seconds before their return arrived, or a verified return names an amount or
 * an order that is not the one we asked Hyp to charge. Voiding the same day is
 * cleaner than a refund for both sides — it never reaches the card statement.
 *
 * **Hyp documents the call as `action`, `Masof`, `PassP` and `TransId`**, with
 * `TransId` being the `Id` from the payment's redirect, and a success as
 * `CCode=0` with `ReversalStatus=777`. It is sent in exactly that shape — no
 * `KEY` — and that is the part still unproven: no real terminal has answered it.
 * A transaction that cannot be voided any more (after 22:00 on the day, or
 * already transmitted) answers `CCode=920`.
 *
 * `zikoyAPI` is the refund for any other day and is not built. A failure here is
 * not a dead end: the caller records that a refund is owed and the artist makes
 * it by hand. The money is never silently kept.
 *
 * @param {object} input
 * @param {string} input.transactionId - Hyp's `Id` from the verified return.
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
    PassP: credentials.password,
    TransId: transactionId,
  });

  return requestAndInterpret(request.toString(), 'cancel', interpretProviderResponse);
}

/**
 * The one place a request leaves this server on the return path.
 *
 * Shared by VERIFY and by the cancellation so both fail the same way. Like
 * everything else here it never throws: a timeout, a refused connection and a
 * provider outage are all codes.
 */
async function requestAndInterpret(query, label, interpret) {
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

  const result = interpret(response.status, body);

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
