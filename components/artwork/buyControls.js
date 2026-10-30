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

/**
 * On the "message Orit" button of a work that cannot be bought — the same
 * action as the floating WhatsApp disc. `AskAboutWork` renders it empty; the
 * disc's own observer writes `"shown"` while it is on screen, and the disc's
 * stylesheet steps out of view for as long as it says so, exactly as it rises
 * for the buy bar. `WhatsAppButton.module.css` writes it out by hand.
 */
export const MESSAGE_CONTROL_ATTRIBUTE = 'data-message-control';

/**
 * On the cart page's total and checkout block, which below 40rem is fixed to
 * the foot of the screen exactly as the buy bar is. Present, never valued: the
 * block is a bar whenever the page draws one, so the disc rises above it the
 * way it rises above the buy bar. The cart page's and the disc's stylesheets
 * write it out by hand.
 */
export const CART_BAR_ATTRIBUTE = 'data-cart-bar';
