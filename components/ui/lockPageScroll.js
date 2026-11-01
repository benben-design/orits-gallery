/**
 * Locks the page behind a modal dialog, and returns the function that unlocks
 * it. Shared by the full-screen view (ArtworkViewer) and the purchase dialog
 * (PurchaseDialog), so the page comes back the same way from either.
 *
 * Hiding the scrollbar widens the page by its width, which on a desktop would
 * shift everything beneath the dialog sideways as it fades in and out. The body
 * is padded by exactly that width, on the side the scrollbar was on, so
 * nothing moves. **Not `scrollbar-gutter: stable`**, which was tried first: it
 * keeps the gutter by narrowing what a fixed element covers too, and the
 * full-screen view stopped 15px short of the screen's edge, a strip of the
 * page showing beside it. Measured on 24-10-2026 in both languages; the side is read rather than
 * assumed, because a browser may put an RTL page's scrollbar on the left.
 *
 * `overscroll-behavior` is what stops a downward swipe on Android being read
 * as pull-to-refresh.
 */
export function lockPageScroll() {
  const root = document.documentElement;
  const body = document.body;
  const scrollbar = window.innerWidth - root.clientWidth;
  const side = root.getBoundingClientRect().left > 0 ? 'paddingLeft' : 'paddingRight';
  const previous = {
    overflow: root.style.overflow,
    overscrollBehavior: root.style.overscrollBehavior,
    padding: body.style[side],
  };

  if (scrollbar > 0) body.style[side] = `calc(${getComputedStyle(body)[side]} + ${scrollbar}px)`;
  root.style.overflow = 'hidden';
  root.style.overscrollBehavior = 'none';

  return () => {
    root.style.overflow = previous.overflow;
    root.style.overscrollBehavior = previous.overscrollBehavior;
    body.style[side] = previous.padding;
  };
}
