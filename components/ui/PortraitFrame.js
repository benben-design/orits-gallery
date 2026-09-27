import Image from 'next/image';
import styles from './PortraitFrame.module.css';

/**
 * The artist's photograph, filling its slot.
 *
 * **This is the one image on the site that may be cropped, and it is not a
 * painting.** The never-crop rule protects works for sale — see images.md —
 * and `ArtworkFrame` enforces it: fitted inside a mat, never filled. A
 * photograph of a person is a different object. Hung on that mat it sat small
 * on white inside a larger box, which reads as a painting of her rather than a
 * picture of her. So the portrait fills its whole slot, and the slot keeps one
 * proportion at every width.
 *
 * **Cropped from the top, never the face.** `object-position` anchors the top
 * edge, so a photograph taller than the slot loses its bottom, and one wider
 * than it loses its sides equally — a head-and-shoulders shot keeps its head
 * either way.
 *
 * **Its own component on purpose, not a tone on `ArtworkFrame`.** A cropping
 * mode inside the painting frame would be one prop away from cropping a
 * painting. Keeping it here means `ArtworkFrame` still never crops, anywhere,
 * and a work cannot be switched into this by accident. Do not "fix" this back
 * into a mat, and do not reach for it for anything that is for sale.
 *
 * **The cropping is CSS, never the image host.** The file is delivered whole,
 * width-limited like every other image through `lib/image-loader.js`, and
 * `npm run check:crop` still asserts that no transformation crops — portrait
 * included. What is cut is only what the slot does not show.
 *
 * @param {{src: string, width: number, height: number}} image - From the site
 *   settings. `fill` does not need the dimensions to lay out, but they are
 *   what the settings row stores, so the shape is the same as a painting's.
 */
export default function PortraitFrame({ image, alt, sizes, priority = false, className = '' }) {
  return (
    <div className={[styles.slot, className].filter(Boolean).join(' ')}>
      <Image
        className={styles.photo}
        src={image.src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
      />
    </div>
  );
}
