import { NextResponse } from 'next/server';
import { defaultLocale, isLocale } from '@/lib/i18n/config';

/**
 * Locale gate for the public site.
 *
 * The locale is always the first segment of the URL. Anything that arrives
 * without one is redirected to the default language, so the bare root lands on
 * Hebrew:
 *
 *   /            ->  /he
 *   /gallery     ->  /he/gallery
 *   /en/gallery  ->  untouched
 *
 * This file was `middleware.js` before Next.js 16 renamed the convention to
 * `proxy`. It reads its languages from lib/i18n/config, so adding a third one
 * needs no change here.
 */
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split('/')[1];

  if (isLocale(firstSegment)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except: Next internals, the admin area and the design-system
   * page (both of which sit outside the locale structure by design), API
   * routes, the painting files, and anything else with a file extension.
   *
   * Leaving /dev out of this list does not make it unreachable in an obvious
   * way — it makes it redirect to /he/dev, which then 404s. If /dev ever stops
   * resolving, check here first.
   */
  matcher: ['/((?!_next/|admin|dev|api/|paintings/|.*\\.[\\w]+$).*)'],
};
