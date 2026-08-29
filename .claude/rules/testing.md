# Testing

No test suite is configured yet.

When one is added, the highest-value targets on this project, in order:

1. **The repository layer.** Slug lookup in both languages including the
   URL-encoded Hebrew case, status and category filtering, ordering, and the
   featured-work fallback. This is the module everything else depends on, and it
   is pure — cheap to test and it stays valid after the database swap.
2. **Status and availability logic.** Especially that a work whose status changed
   cannot be purchased. See commerce.md.
3. **The image manifest script.** That real dimensions are read correctly for
   both orientations and both file types.
4. **Locale key parity.** That `he.json` and `en.json` have identical key sets —
   a missing translation is a bug that no page-level test will catch.

Until then, verification is manual, and the checklist is: every page in both
languages, right-to-left and left-to-right, mobile and desktop, with no console
errors and no hydration warnings.
