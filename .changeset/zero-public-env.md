---
"@pyreon/zero": minor
---

Make `publicEnv()` work in the browser, and accept any Standard Schema for env
validation (zero-dependency).

**Isomorphic `publicEnv()`.** Previously `publicEnv()` read `process.env`, which
is `undefined` in the browser — so it silently returned `{}` client-side despite
being documented "client-safe." Now `@pyreon/zero`'s vite-plugin reads
`ZERO_PUBLIC_*` vars from your `.env*` files at build time and inlines the
(prefix-stripped) snapshot as a `define` into **both** the client and SSR
bundles, so `publicEnv()` works in server AND browser code, and a value rendered
during SSR matches after hydration (no mismatch).

**Security boundary.** Only `ZERO_PUBLIC_`-prefixed vars are ever inlined — a
secret without the prefix (`DATABASE_URL`, `STRIPE_SECRET_KEY`) is structurally
unable to reach the client bundle.

**Bring-your-own validation.** `validateEnv` and `publicEnv` now accept any
[Standard Schema](https://standardschema.dev) directly — zod / valibot / arktype
/ `@pyreon/validate`'s `s` — duck-typed, so `@pyreon/zero` depends on no schema
library. The raw env string is handed to the schema, so use a coercing schema
(`z.coerce.number()`, `s.stringbool()`); async schemas are rejected.

Note: public values are inlined at build time — changing one requires a rebuild,
not just a redeploy.
