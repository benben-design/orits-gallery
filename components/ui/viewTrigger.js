/**
 * The attribute that marks an image on the artwork page as one the full-screen
 * view can open, carrying its position in the work's image list.
 *
 * Its own plain module because a server component writes it and a client
 * component reads it — and a constant exported from a `'use client'` file
 * reaches a server component as a client reference, not as the string. Two
 * literals is how the two halves stop matching.
 */
export const VIEW_INDEX_ATTRIBUTE = 'data-view-index';
