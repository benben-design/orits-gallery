'use client';

import ButtonLink from '@/components/ui/ButtonLink';
import FallbackPage from '@/components/ui/FallbackPage';
import { useFallback } from '@/components/layout/fallback-context';
import { localeHref } from '@/lib/i18n/config';

/**
 * The public site's 404, inside the normal shell and in the language of the
 * address that was asked for.
 *
 * **Every way of not finding something ends here**, which is what makes them
 * indistinguishable:
 *
 *   - an unknown or unpublished painting — the artwork route calls `notFound()`
 *     for both, because the public read cannot see a draft;
 *   - any other path under a locale — `[...missing]/page.js` beside this file
 *     catches what no route matches and calls `notFound()`, since an unmatched
 *     URL would otherwise skip this file for Next's bare default;
 *   - a path with no locale — `proxy.js` sends it to the default language
 *     first, where it is one of the above.
 *
 * All of them answer 404 with the same body and the same title (the artwork
 * route and the catch-all both name it in their metadata), so nothing tells a
 * guessed draft address from a made-up one. Next adds `noindex` to every
 * not-found response by itself.
 *
 * A client component only because Next hands this file no `params`: the
 * locale and the words come from the layout, through `useFallback`.
 */
export default function NotFound() {
  const { locale, notFound } = useFallback();

  return (
    <FallbackPage
      title={notFound.title}
      body={notFound.body}
      actions={
        <>
          <ButtonLink href={localeHref(locale, '/gallery')} variant="primary">
            {notFound.gallery}
          </ButtonLink>
          <ButtonLink href={localeHref(locale, '/')} variant="quiet">
            {notFound.home}
          </ButtonLink>
        </>
      }
    />
  );
}
