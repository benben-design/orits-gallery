# Security

- Every database query is parameterized. Never interpolate input into SQL.
- Secrets live in environment variables and never in the repo. `.env.example` at
  the repo root is that template and is committed, so every value in it is a
  dummy; the real `.env.local` is git-ignored by the `.env*.local` rule. Add a
  key to the example in the same change that starts reading it.
- **There are two admin accounts — the artist's and the developer's — with
  equal rights.** Nothing may assume a single row. There is no role column, so
  either account can change or delete the other; that is a deliberate choice for
  two people who know each other, not an oversight.
- **Email uniqueness is case-insensitive**, enforced on the lowercased address.
  Lookups must match the same way or they will not use the index — and a login
  that fails on capitalisation is indistinguishable from a forgotten password.
- **Only a password hash is ever stored.** There is no plaintext column and
  adding one is not a shortcut worth taking under any deadline. Hashing happens
  in the application, never in SQL: a password passed to a database function is
  a password in the query log.
- **Authentication itself is not built.** Planned as httpOnly cookies — no token
  in `localStorage`, ever — but nothing beyond that is designed, there is no
  password-reset mechanism, and the accounts table is empty.
- The auth check is applied in one place and covers **every** admin route and
  **every** mutation, not only the pages that render a form. An unguarded write
  endpoint is the whole breach.
- Never trust an identity, a price, a status or a total from a request body. The
  server derives identity from the verified session and computes money from its
  own records.
- Validate against the exported constants — `WORK_STATUSES`, `WORK_CATEGORIES`,
  `IMAGE_TYPES` — rather than writing whatever value arrived.
- Uploads are constrained by type and size, and a file's own claimed name or
  content type is not evidence of what it is.
- Payment state is written only by the provider's verified webhook. Never mark
  an order paid from a client redirect or callback.
- Errors shown to a user say what to do next; stack traces and internal detail go
  to the server log only.
- The admin is excluded from indexing in two places — `robots` and the
  `X-Robots-Tag` header in `vercel.json`. Keep both.
