import { revalidatePath, revalidateTag } from 'next/cache';
import { WORKS_CACHE_TAG } from '@/lib/data/works-repository';

/**
 * Clearing the public site's caches, in one place.
 *
 * **Two caches, two mechanisms, and they are not interchangeable.** Since the
 * homepage carries a revalidation window it is a prerendered page held in the
 * route cache, cleared by path; the gallery's catalogue read is a data-cache
 * entry held under a tag, cleared by tag. A write that clears one and not the
 * other leaves the site half stale, and which half depends on which page you
 * happen to open.
 *
 * That is exactly the mistake this module exists to make impossible. Every
 * caller gets both, because no caller has ever wanted one.
 *
 * **`revalidatePath('/', 'layout')` is deliberately blunt.** It clears the
 * whole public tree rather than naming the pages a given write touched. At this
 * size that is the right trade: the alternative is a list of paths per action,
 * in two languages, which is a list to keep in step with the route map forever
 * — and the failure mode of forgetting an entry is a painting the site still
 * offers after it sold. Rebuilding a sixteen-work page costs one query.
 *
 * **Call it after the write has landed, never before.** These invalidate a
 * cache; they do not wait for anything. Called before a transaction commits,
 * the next render can repopulate the cache from the old rows and the stale
 * value is then held for the full window.
 *
 * Used by every admin mutation in app/(admin)/admin/actions.js and by the
 * verified-success branch of lib/payments/handle-return.js. The second of those
 * is the one that was missing: a painting could be marked sold by a real
 * payment with nothing clearing the pages that offer it.
 */
export function revalidatePublicSite() {
  revalidatePath('/', 'layout');

  /*
    `'max'` expires the entry outright. The single-argument form is deprecated in
    Next 16 and warns on every call.

    **Not `updateTag`**, which Next offers for the same job with
    read-your-own-writes semantics: it may only be called from a Server Action,
    and this helper is shared with the payment return, which is a route handler.
    One function that works from both beats two that each work from one.
  */
  revalidateTag(WORKS_CACHE_TAG, 'max');
}
