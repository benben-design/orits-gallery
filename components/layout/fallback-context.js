'use client';

import { createContext, useContext, useMemo } from 'react';

/**
 * What the not-found and error pages need to say, in the language of the
 * address that was requested.
 *
 * **Why a context, when everything else gets its strings as props.** Neither
 * page can be handed props: Next renders `not-found.js` and `error.js` itself,
 * with no `params`, and `error.js` must be a client component, so it cannot
 * call `getDictionary`. Both render inside the public layout, though, and the
 * layout knows the locale — so it resolves the two small dictionary slices and
 * the WhatsApp link on the server, once, and this carries them down.
 *
 * Only those slices travel, never the whole dictionary: whatever a client
 * component is given is serialized into every public page, and this is on every
 * page whether or not anything goes wrong. The same reasoning as the cart's
 * dictionary in the layout.
 *
 * @type {import('react').Context<null | {
 *   locale: string,
 *   notFound: {title: string, body: string, gallery: string, home: string},
 *   pageError: {title: string, body: string, retry: string, home: string, whatsapp: string},
 *   whatsappHref: string|null,
 * }>}
 */
const FallbackContext = createContext(null);

/**
 * Each slice arrives as its own prop, under the same name `useFallback` hands
 * it back by — which is what lets `npm run check:strings` follow a string from
 * the layout to the page that renders it.
 */
export function FallbackProvider({ locale, notFound, pageError, whatsappHref, children }) {
  const value = useMemo(
    () => ({ locale, notFound, pageError, whatsappHref }),
    [locale, notFound, pageError, whatsappHref]
  );

  return <FallbackContext.Provider value={value}>{children}</FallbackContext.Provider>;
}

/**
 * The copy, for `not-found.js` and `error.js` under app/(site)/[locale].
 *
 * Throws without a provider, like `useCart`: a fallback page that rendered
 * blank because it was moved outside the layout would be found by a visitor
 * long before anybody else.
 */
export function useFallback() {
  const value = useContext(FallbackContext);

  if (!value) {
    throw new Error(
      'useFallback must be used inside <FallbackProvider>, which the public ' +
        'layout renders around its pages.'
    );
  }

  return value;
}
