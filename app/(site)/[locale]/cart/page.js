import Link from 'next/link';
import Container from '@/components/ui/Container';
import { Trash2, CreditCard } from 'lucide-react';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ButtonLink from '@/components/ui/ButtonLink';
import CartLine from '@/components/cart/CartLine';
import { CART_BAR_ATTRIBUTE } from '@/components/artwork/buyControls';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { localeHref } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { formatPrice } from '@/lib/format';
import { isBuyable } from '@/components/ui/statusPresentation';
import { readCartIds } from '@/lib/cart/cart-cookie';
import { cartTotal } from '@/lib/cart/cart-contents';
import { removeMissingFromCart } from '@/lib/cart/actions';
import { getWorksByIds } from '@/lib/data/works-repository';
import styles from './page.module.css';

/**
 * /[locale]/cart — the paintings someone has chosen, and the truth about
 * whether they can still have them.
 *
 * **A server component that re-reads every work on every render**, which is the
 * entire design. The cookie holds ids; the database holds everything else. So
 * a painting that sold on under1000 while this cart sat in a browser is caught
 * *here*, before any money moves — commerce.md calls that the most damaging
 * failure mode in the product, and this page plus the check inside checkout are
 * the two places it is caught.
 *
 * It reads cookies, so it is dynamic by construction. That is correct and
 * costs nothing: a cart is per-visitor, has nothing to cache and nothing to
 * rank, which is also why seo.md keeps it out of the sitemap on purpose rather
 * than by omission.
 *
 * **Three kinds of line, and the third is the interesting one.** An id may
 * resolve to a work a visitor may buy, to one they may not — sold, reserved,
 * withdrawn — or to nothing at all, because the painting was deleted or taken
 * off the site. The third cannot be drawn: there is no title to print and no
 * picture to show. So it is reported as a count with one control that clears
 * them, rather than as a row of blanks.
 *
 * **Nothing is tidied away automatically.** Next only allows a cookie to be set
 * from a Server Action, not while rendering, and that constraint is worth
 * agreeing with: a cart changes because somebody pressed something. A page
 * that silently dropped items would also be a page that could not explain what
 * it had done.
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  /*
    No canonical and no alternates. A cart is per-visitor state; `robots.js`
    does not disallow it, but there is nothing here to index and no second
    language version of somebody's own choices worth declaring. seo.md.
  */
  return { title: dictionary.cart.title, robots: { index: false, follow: true } };
}

export default async function CartPage({ params }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  const ids = await readCartIds();
  const works = await getWorksByIds(ids);

  /*
    Back into the order they were added. The repository orders by date, because
    that is a fact about the catalogue; the order of a cart is a fact about the
    visit, so it is restored here. Anything that did not come back is a work
    that no longer resolves — see below.
  */
  const byId = new Map(works.map((work) => [work.id, work]));
  const held = ids.map((id) => byId.get(id)).filter(Boolean);
  const missingCount = ids.length - held.length;

  /* Only what can actually be bought counts towards the total. */
  const total = cartTotal(held.filter((work) => isBuyable(work.status)));

  return (
    <Section>
      <Container>
        {/*
          The site's heading block, asked for an h1 — this is the page's own
          subject rather than a section of a longer one. The gallery renders the
          same primitive.
        */}
        <SectionHeading as="h1">{dictionary.cart.title}</SectionHeading>

        {ids.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>{dictionary.cart.empty}</p>
            <ButtonLink href={localeHref(locale, '/gallery')}>
              {dictionary.cart.emptyAction}
            </ButtonLink>
          </div>
        ) : (
          /* Narrower than the page — see the note on .column. */
          <div className={styles.column}>
            <p className={styles.count}>
              {interpolate(dictionary.cart.itemCount, { count: ids.length })}
            </p>

            {held.length > 0 ? (
              <ul className={styles.lines} aria-label={dictionary.cart.listLabel}>
                {held.map((work) => (
                  <li key={work.id}>
                    <CartLine work={work} locale={locale} dictionary={dictionary} />
                  </li>
                ))}
              </ul>
            ) : null}

            {missingCount > 0 ? (
              /*
                Paintings that no longer resolve to anything public. They cannot
                be named, so they are counted — and one control clears all of
                them, because there is no per-line remove to offer.
              */
              <div className={styles.missing}>
                <div>
                  <h2 className={styles.missingTitle}>{dictionary.cart.missingTitle}</h2>
                  <p className={styles.missingCount}>
                    {interpolate(dictionary.cart.missingCount, { count: missingCount })}
                  </p>
                </div>

                <form action={removeMissingFromCart}>
                  <button type="submit" className={styles.missingAction}>
                    <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    <span>{dictionary.cart.removeMissing}</span>
                  </button>
                </form>
              </div>
            ) : null}

            {total ? (
              /*
                On a phone this is fixed to the foot of the screen, the way the
                artwork page's buy bar is, so the total and the way to pay are
                in reach however many paintings sit above them.
              */
              <div className={styles.summary} {...{ [CART_BAR_ATTRIBUTE]: '' }}>
                <p className={styles.totalRow}>
                  <span className={styles.totalLabel}>{dictionary.cart.total}</span>
                  <span className={styles.totalAmount}>
                    <bdi>{formatPrice(total, locale)}</bdi>
                  </span>
                </p>

                {/*
                  The checkout control, **a real link now that the checkout
                  exists**. It was a deliberately inert `<button>` with a "not open
                  yet" line beneath it, because a link to a stub page would have
                  asserted that a checkout existed and was broken. Both the
                  `aria-disabled` and that line are gone together with the reason
                  for them.

                  This page still works with no JavaScript at all, and so does this
                  link — which is the property that made `/cart` worth keeping when
                  the drawer became the primary cart.
                */}
                <Link href={localeHref(locale, '/checkout')} className={styles.checkout}>
                  <CreditCard size={18} strokeWidth={1.5} aria-hidden="true" />
                  <span>{dictionary.cart.checkout}</span>
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </Container>
    </Section>
  );
}
