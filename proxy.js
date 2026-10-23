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

  /*
    A path that is not valid percent-encoding — `/he/art/%E0%A4%A`, a lone `%` —
    is no page of ours. Next fails to decode a dynamic segment like `[slug]`
    before the page runs and answered those with a 500 (found 23-10-2026), so
    anybody could make the artwork route error on demand. Refused here, before
    any rendering, as the malformed request it is.
  */
  try {
    decodeURIComponent(pathname);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const firstSegment = pathname.split('/')[1];

  if (isLocale(firstSegment)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except: Next internals, the admin area (outside the locale
   * structure by design — the design system lives there too, at /admin/dev),
   * API routes, the painting files, and anything else with a file extension.
   *
   * **`/dev` is deliberately not excluded.** The design system used to live
   * there and moved under /admin in September 2026, behind the guard. `/dev`
   * now goes where every path that does not exist goes — to /he/dev, which
   * 404s — so it answers exactly like any other guess and says nothing about
   * where the page went.
   */
  matcher: ['/((?!_next/|admin|api/|paintings/|.*\\.[\\w]+$).*)'],
};
