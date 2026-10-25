/**
 * The two attributes that tie the phone's buy bar to the page around it.
 *
 * Constants in a plain module because three files meet on them — `AddToCart`
 * marks the original controls, `BuyBar` watches them and says whether it is
 * showing, and the floating WhatsApp button's stylesheet reads that to rise
 * above it — and three literals is how they stop matching.
 *
 * The stylesheets cannot import a constant, so `BuyBar.module.css` and
 * `WhatsAppButton.module.css` write `data-buy-bar` out by hand; each says so
 * beside the selector.
 */

/** On the original buy controls, which the bar stands in for when they are off screen. */
export const BUY_CONTROLS_ATTRIBUTE = 'data-buy-controls';

/** On the bar itself: `"shown"` or `"hidden"`. */
export const BUY_BAR_ATTRIBUTE = 'data-buy-bar';
