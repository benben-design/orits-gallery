# Security

- Every database query is parameterized. Never interpolate input into SQL.
- Secrets live in environment variables and never in the repo. Keep an
  `.env.example` with dummy values as the template.
- The admin is a single account belonging to the artist. Authentication is
  planned as httpOnly cookies — no token in `localStorage`, ever.
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
