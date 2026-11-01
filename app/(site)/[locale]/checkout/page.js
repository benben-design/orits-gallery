import { redirect } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ButtonLink from '@/components/ui/ButtonLink';
import CheckoutSummary from '@/components/checkout/CheckoutSummary';
import CheckoutForm from '@/components/checkout/CheckoutForm';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatPrice } from '@/lib/format';
import { readCartIds } from '@/lib/cart/cart-cookie';
import { quoteCheckout } from '@/lib/data/orders-repository';
import { getWorksByIds } from '@/lib/data/works-repository';
import { getSiteSettings } from '@/lib/data/settings-repository';
import { whatsappHref } from '@/lib/contact';
import { submitCheckout } from '@/lib/checkout/actions';
import { isHypConfigured, isTestTerminal } from '@/lib/payments/hyp';
import { isOnlinePaymentEnabled } from '@/lib/sales-mode';
import styles from './page.module.css';

/**
 * /[locale]/checkout — who is buying, how the painting travels, and what it costs.
 *
 * **A server component that re-reads and re-prices everything on every render**,
 * for the same reason the cart page does: the cookie holds ids and the database
 * holds every other fact. A painting that sold on under1000 while somebody was
 * filling this form in is caught here, and again inside the transaction that
 * writes the order. See commerce.md on the double-sale problem.
 *
 * **Two ways in, and they never mix.** Ordinarily the list is the cart. With
 * `?work=<id>` it is exactly one painting — quick-buy from an artwork page — and
 * the cart is not read at all and not altered. That is what "straight to
 * checkout without disturbing the cart" means: no second cookie, nothing to
 * reconcile afterwards, and the URL is shareable and survives the back button.
 *
 * **Every amount arrives already computed in agorot** by the orders repository,
 * for both delivery methods, and is only formatted here. Nothing on this page or
 * below it adds a delivery fee to a price.
 *
 * It reads cookies, so it is dynamic by construction — correct for a page that
 * is per-visitor, has nothing to cache and nothing to rank. seo.md keeps it out
 * of the sitemap deliberately rather than by omission.
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  /*
    No canonical and no alternates, exactly as the cart declares none: there is
    no second-language version of somebody's own purchase worth pairing, and
    nothing here to index. `follow` stays true because the paintings linked from
    it are pages worth reaching.
  */
  return { title: dictionary.checkout.title, robots: { index: false, follow: true } };
}

export default async function CheckoutPage({ params, searchParams }) {
  const { locale } = await params;

  /*
    In contact mode there is no checkout at all, and this is the server half of
    that rather than a hidden button: the page is gone before the cart is read,
    anything is priced or a form exists to post. The cart is where every way in
    lands, because its purchase control is what a buyer needs instead. See
    lib/sales-mode.js. `submitCheckout` refuses in the same way, on its own.
  */
  if (!isOnlinePaymentEnabled()) redirect(localeHref(locale, '/cart'));

  const { work: quickBuyId } = await searchParams;
  const dictionary = await getDictionary(locale);

  /*
    A malformed id is not special-cased. The repository compares ids as text, so
    a value that is not a uuid simply matches no row and arrives below as
    "unavailable" — the same answer a sold painting gets, which is the honest one.
  */
  const workId = typeof quickBuyId === 'string' && quickBuyId ? quickBuyId : null;
  const workIds = workId ? [workId] : await readCartIds();

  const quote = await quoteCheckout(workIds);

  /*
    The summary needs the paintings as the works repository returns them — image,
    medium, dimensions — which the quote deliberately does not carry: the quote is
    about money. Public-scoped, so this cannot draw anything the quote would not
    sell.
  */
  const sellableIds = quote.sellable.map((line) => line.workId);
  const works = await getWorksByIds(sellableIds);
  const byId = new Map(works.map((item) => [item.id, item]));
  const orderedWorks = sellableIds.map((id) => byId.get(id)).filter(Boolean);

  const configured = isHypConfigured();
  const settings = await getSiteSettings();

  return (
    <Section>
      <Container>
        <SectionHeading as="h1">{dictionary.checkout.title}</SectionHeading>

        {/* Narrower than the page, the same measure the cart reads at. */}
        <div className={styles.column}>
          {orderedWorks.length === 0 ? (
            /*
              Nothing to buy: an empty cart, a quick-buy id that no longer
              resolves, or a cart whose every painting has gone. One state for all
              three — at this point the distinction is not something a buyer can
              act on differently, and the way out is the same.
            */
            <div className={styles.empty}>
              <p className={styles.emptyText}>{dictionary.checkout.empty}</p>
              <ButtonLink href={localeHref(locale, '/gallery')}>
                {dictionary.cart.emptyAction}
              </ButtonLink>
            </div>
          ) : (
            <>
              {/*
                On a phone the order folds into one line, because the list of
                paintings filled the first screen and the first field began at
                1115px. A plain <details>, so it opens and closes with no script
                at all. It counts the paintings and carries their sum — never the
                total to pay, which depends on the delivery chosen in the form
                below and is shown there; "2 ציורים: ₪5,250" reads as what the
                paintings come to, not as the final figure.

                The list itself stays one copy, beside the <details> rather than
                inside it: the stylesheet hides it while the line is closed below
                40rem, and from 40rem the line is not drawn and the list is as it
                always was.
              */}
              <details className={styles.summaryToggle}>
                <summary className={styles.summaryLine}>
                  <span>
                    {orderedWorks.length === 1
                      ? dictionary.checkout.summaryLineOne
                      : interpolate(dictionary.checkout.summaryLineMany, {
                          count: orderedWorks.length,
                        })}{' '}
                    <bdi>{formatPrice(quote.subtotal, locale)}</bdi>
                  </span>
                  <ChevronDown
                    className={styles.summaryChevron}
                    size={18}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </summary>
              </details>
              <div className={styles.summaryBody}>
                <h2 className={styles.summaryTitle}>{dictionary.checkout.summaryTitle}</h2>

                <CheckoutSummary works={orderedWorks} locale={locale} dictionary={dictionary} />
              </div>

              {/*
                Something in the cart cannot be sold. **The form is not offered at
                all**, and that is the honest arrangement rather than the tidy one:
                showing a total for what remains would promise to sell the rest,
                and the action refuses the whole order — a cart containing a
                painting that has gone is not a cart anybody can pay for. So the
                only thing on offer is the way back to fix it.

                This is a courtesy, not the boundary. The same check runs again
                inside the transaction that writes the order, because a painting
                can sell between this render and that submit. See commerce.md.
              */}
              {quote.unavailable.length > 0 ? (
                <div className={styles.notice} role="status">
                  <p>{dictionary.checkout.unavailableLead}</p>
                  <ul className={styles.noticeList}>
                    {quote.unavailable
                      .filter((entry) => entry.title)
                      .map((entry) => (
                        <li key={entry.id}>{entry.title[locale]}</li>
                      ))}
                  </ul>
                  {quote.unavailable.some((entry) => !entry.title) ? (
                    <p>
                      {interpolate(dictionary.checkout.unavailableUnknown, {
                        count: quote.unavailable.filter((entry) => !entry.title).length,
                      })}
                    </p>
                  ) : null}
                  <p className={styles.noticeAction}>
                    <ButtonLink href={localeHref(locale, '/cart')}>
                      {dictionary.checkout.unavailableAction}
                    </ButtonLink>
                  </p>
                </div>
              ) : configured ? (
                <>
                  {/*
                    A test terminal is saying so out loud. On a preview deployment
                    the question "was that a real charge" is otherwise
                    unanswerable from the outside, and getting it wrong in either
                    direction is somebody's money.
                  */}
                  {isTestTerminal() ? (
                    <p className={styles.testMode}>{dictionary.checkout.testModeNote}</p>
                  ) : null}

                  <CheckoutForm
                    /*
                      Both arguments bound on the server: the locale is the
                      language actually being read — it is written to the order and
                      cannot be recovered afterwards — and the quick-buy id cannot
                      be swapped for another painting by editing the form.
                    */
                    action={submitCheckout.bind(null, locale, workId)}
                    locale={locale}
                    dictionary={dictionary}
                    amounts={{ subtotal: quote.subtotal, methods: quote.methods }}
                    /*
                      Only drawn if this source is rate limited, as the way to
                      buy anyway. Null when no number is set, and the sentence
                      then stands alone rather than ending in a dead link.
                    */
                    whatsappHref={whatsappHref(
                      settings.whatsappNumber,
                      dictionary.nav.whatsappMessage
                    )}
                  />
                </>
              ) : (
                /*
                  No payment credentials. The form is left out entirely rather than
                  offered and failing on submit — the same arrangement the admin's
                  work form makes when the image host is unconfigured. An absent
                  feature is honest; a control that dies under a finger is not.
                */
                <p className={styles.notice}>{dictionary.checkout.notConfigured}</p>
              )}
            </>
          )}
        </div>
      </Container>
    </Section>
  );
}
