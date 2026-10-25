'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The wordmark's link home — and, on the homepage itself, a glide back up to
 * the hero instead of a navigation that would only jump there.
 *
 * A client component for the one thing a server component cannot know: which
 * page it is on. Off the homepage it is an ordinary link and does nothing
 * special. On it, the click scrolls smoothly to the top, unless the visitor
 * has asked their system for reduced motion, in which case it simply jumps.
 *
 * Not `scroll-behavior: smooth` on <html>: that would smooth every in-page
 * jump on the site, the skip link included, to fix one link.
 *
 * `children` arrives already rendered on the server — the mark is an image
 * and needs nothing from the browser.
 */
export default function HomeMarkLink({ href, className, children }) {
  const pathname = usePathname();

  function handleClick(event) {
    // Compare decoded: the path the browser reports and the href we built
    // may differ only in percent-encoding.
    if (decodeURI(pathname) !== decodeURI(href)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
