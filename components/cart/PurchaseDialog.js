'use client';

import { useEffect, useId, useRef } from 'react';
import { Mail, Phone, X } from 'lucide-react';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { lockPageScroll } from '@/components/ui/lockPageScroll';
import { chargeableAmount } from '@/lib/cart/cart-contents';
import { purchaseWhatsappHref } from '@/lib/cart/purchase-message';
import { displayPhone, mailtoHref, telHref } from '@/lib/contact';
import { formatPrice } from '@/lib/format';
import styles from './PurchaseDialog.module.css';

/**
 * Purchasing by contact: the paintings, their total, and the ways to reach the
 * artist — opened in place of the checkout while the site is in contact mode
 * (lib/sales-mode.js). One dialog for the whole public site, rendered by
 * `CartProvider` and opened through the cart context, from the drawer, the
 * `/cart` page and "buy now" on an artwork page.
 *
 * **It opens on what is different, not on what was pressed.** A buyer who
 * pressed "Purchase" expects a payment page, so the heading is the news —
 * Orit would be happy to talk with you directly — with the arrangement in one
 * muted line beneath it, and only then the paintings, the total and the ways
 * to reach her. The heading used to say "Purchase", repeating the button, and
 * the sentence that mattered sat as body text between the total and the
 * filled button, where the eye goes straight past it. The emphasis is position
 * and size, never a box or a second colour: the one accent is WhatsApp's.
 *
 * **WhatsApp first and the only filled accent**, carrying a message that names
 * every painting with its link and the total (lib/cart/purchase-message.js).
 * Phone and email follow as quiet rows, the contact page's own treatment. A
 * detail left empty in the settings is not drawn — `null` is the only way the
 * settings say "not provided", so there is no placeholder to filter.
 *
 * **A native `<dialog>` opened with `showModal()`**, like the full-screen view:
 * the page behind is inert, focus moves in (to the close button, the first
 * control), and Escape closes it. On top of that the page's scroll is locked,
 * a tap on the backdrop closes it, and focus is put back on whatever opened
 * it — `onClose` is the provider's, which owns that element.
 *
 * Escape is kept here rather than reaching the cart drawer's document
 * listener, so pressing it in the dialog over an open drawer closes the dialog
 * and leaves the drawer where it was. See ArtworkViewer for the same listener.
 */
export default function PurchaseDialog({ purchase, contact, siteOrigin, dictionary, locale, onClose }) {
  const dialogRef = useRef(null);
  const unlockRef = useRef(null);
  const titleId = useId();
  const noteId = useId();
  const copy = dictionary.cart;

  /* Opens whenever there is something to show; closing clears it upstream. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!purchase || !dialog || dialog.open) return;
    dialog.showModal();
    unlockRef.current = lockPageScroll();
  }, [purchase]);

  /* If the page goes away with the dialog open, the page's scroll comes back. */
  useEffect(() => () => unlockRef.current?.(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const keepEscape = (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    };
    dialog.addEventListener('keydown', keepEscape);
    return () => dialog.removeEventListener('keydown', keepEscape);
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  /** The one place a close is finished — the button, Escape or the backdrop. */
  function onDialogClose() {
    unlockRef.current?.();
    unlockRef.current = null;
    onClose();
  }

  /* A click whose target is the dialog itself landed on the backdrop. */
  function onDialogClick(event) {
    if (event.target === event.currentTarget) close();
  }

  const whatsapp = purchase
    ? purchaseWhatsappHref({
        whatsappNumber: contact.whatsappNumber,
        works: purchase.works,
        total: purchase.total,
        locale,
        message: {
          intro: copy.purchaseMessageIntro,
          line: copy.purchaseMessageLine,
          total: copy.purchaseMessageTotal,
        },
        siteOrigin,
      })
    : null;

  const rows = [
    { key: 'phone', label: copy.purchasePhone, Icon: Phone, href: telHref(contact.phone), value: displayPhone(contact.phone) },
    { key: 'email', label: copy.purchaseEmail, Icon: Mail, href: mailtoHref(contact.email), value: contact.email },
  ].filter((row) => row.href);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onClose={onDialogClose}
      onClick={onDialogClick}
    >
      {purchase ? (
        <div className={styles.panel}>
          <div className={styles.head}>
            <h2 id={titleId} className={styles.title}>
              {copy.purchaseLead}
            </h2>
            {/* The first control, so it is where showModal() puts focus. */}
            <button type="button" className={styles.close} onClick={close} aria-label={copy.close}>
              <X size={22} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <p id={noteId} className={styles.note}>
              {copy.purchaseNote}
            </p>
          </div>

          <ul className={styles.works} aria-label={copy.purchaseListLabel}>
            {purchase.works.map((work) => (
              <li key={work.id} className={styles.work}>
                <span className={styles.workTitle}>{work.title[locale]}</span>
                <span className={styles.workPrice}>
                  <bdi>
                    {formatPrice({ amount: chargeableAmount(work), currency: work.price.currency }, locale)}
                  </bdi>
                </span>
              </li>
            ))}
          </ul>

          <p className={styles.totalRow}>
            <span className={styles.totalLabel}>{copy.total}</span>
            <span className={styles.totalAmount}>
              <bdi>{formatPrice(purchase.total, locale)}</bdi>
            </span>
          </p>

          {/*
            A plain anchor in a new tab, as everywhere else WhatsApp is offered:
            it leaves the site, and the paintings stay open behind the chat.
          */}
          {whatsapp ? (
            <a href={whatsapp} className={styles.whatsapp} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon className={styles.whatsappIcon} />
              <span>{copy.purchaseWhatsapp}</span>
            </a>
          ) : null}

          {rows.length > 0 ? (
            <ul className={styles.rows}>
              {rows.map(({ key, label, Icon, href, value }) => (
                <li key={key}>
                  <a href={href} className={styles.row}>
                    <span className={styles.label}>
                      <Icon size={16} strokeWidth={1.5} aria-hidden="true" className={styles.icon} />
                      {label}
                    </span>
                    {/*
                      Two spans, as on the contact page: the outer follows the
                      page's direction so a wrapped value stays at the far end,
                      the inner is the isolated left-to-right run.
                    */}
                    <span className={styles.value}>
                      <span className={styles.valueText} dir="ltr">
                        {value}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
