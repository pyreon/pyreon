---
"@pyreon/core": patch
"@pyreon/runtime-dom": patch
"@pyreon/runtime-server": patch
---

refactor(core,runtime-dom,runtime-server): single-source the URL-attribute injection guard

Extracts `URL_ATTRS`, `UNSAFE_URL_RE`, and `isSafeImageDataUri` into
`@pyreon/core/url-guard` (`@internal`), imported by both renderers — the client
`@pyreon/runtime-dom` (`setStaticProp` + the DOMParser sanitizer) and the SSR
`@pyreon/runtime-server` (`renderProp`).

Previously each renderer carried an independent copy of the guard. That drift is
exactly what shipped the `data:image/*` placeholder allowlist to the client
(#1212, 0.28.1) but not to SSG static HTML (fixed in #1314) — collapsing both
into one source means the two can no longer diverge. `isSafeImageDataUri` now
takes a string `tagName` (matched case-insensitively), so the client passes
`el.tagName` and the server passes the JSX tag.

No behavior change: the exhaustive allow/block matrix now lives once in
`@pyreon/core`'s `url-guard.test.ts`; each renderer keeps its existing matrix as
a wiring regression guard, and the full `<Image>` → SSR placeholder pipeline is
locked by a new `@pyreon/zero` integration test.
