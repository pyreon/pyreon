---
"@pyreon/zero": minor
---

**404 pages now ship `<meta name="robots" content="noindex, nofollow">` by default.**

The framework knows it's emitting a 404 — `render404Page()` (runtime) and the SSG plugin's per-locale `__renderNotFound` writeFile path (build-time) both go through one boundary. Pre-fix, the `<Meta>` component's default of `'index, follow'` reached `dist/404.html` unmodified because most `_404.tsx` examples don't override the robots meta. Result: search engines indexed and ranked the 404 page, blog-style 404 templates without explicit `<Meta robots="noindex">` leaked thin/canonical-conflict content into the index.

New shared helper `ensureNoindexMeta(html)` (`packages/zero/zero/src/not-found.ts`) injects the noindex tag into the rendered head IF no `<meta name="robots">` is already present:

- **User override always wins** — any explicit `<Meta robots="...">` (or hand-written meta in the template) is preserved verbatim. Case-insensitive regex covers single AND double quotes, any attribute order.
- **Idempotent** — calling on already-injected HTML returns it unchanged. Safe to re-run.
- **Safe on body-only fragments** — when no `</head>` is found, returns the input unchanged rather than emitting a stray meta outside any document structure.

Wired at TWO emit boundaries:
- `render404Page()` (runtime — dev SSR + production handler fallback + `handle404`)
- SSG plugin's per-locale 404 emit path (`__renderNotFound` → `ensureNoindexMeta(injectIntoTemplate(template, result))` → writeFile)

Apps that DO want their 404 indexed can opt in with `<Meta robots="index, follow">` in their `_404.tsx` — the framework respects the override.
