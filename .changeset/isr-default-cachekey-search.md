---
"@pyreon/zero": minor
---

**ISR `cacheKey` default changed from `url.pathname` to `url.pathname + url.search`** + new dev-mode warning at handler init when no `cacheKey` is configured.

**Why** — the pre-fix default silently served `/posts?id=42` HTML for `/posts?id=99` requests because both URLs collapsed to the same cache entry `/posts`. Visibly wrong content, structurally invisible to tests that probe one URL per route. M1.1's opt-in `cacheKey` was a band-aid; the unsafe default was the actual bug. The new default matches Next.js ISR + RSC conventions: query strings carry session IDs, pagination state, sort/filter selectors that all affect rendered HTML — they belong in the key.

**Cookies / Authorization headers are still NOT included by default** — auth-gated content still requires an explicit `cacheKey`. The auth-incompatibility caveat from M1.1 survives, just narrower in scope.

**One-time dev-mode warning** fires at handler init when `cacheKey` is undefined (gated on bare `process.env.NODE_ENV !== 'production'` so it tree-shakes in production; deduped via WeakSet so a busy CMS doesn't spam logs; per-handler-instance contract). The warning names BOTH trade-offs inline so the fix is one log away:

- **AUTH-UNSAFE** → `cacheKey: (req) => `${pathname}::${session}`` to vary by user
- **HIGH-CARDINALITY** → `cacheKey: (req) => new URL(req.url).pathname` to strip analytics tokens (`utm_*`, `fbclid`, `gclid`)

**Breaking default change in a minor bump** (pre-1.0 framework convention): apps relying on `pathname`-only caching with high-cardinality URLs will see cache growth proportional to unique query strings. The warning at handler init names the fix. To preserve the pre-fix behavior: `cacheKey: (req) => new URL(req.url).pathname`.
