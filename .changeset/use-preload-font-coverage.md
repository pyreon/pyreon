---
'@pyreon/zero': patch
---

`usePreloadFont` (PR #1359) — verify-modes cell + real-Chromium e2e coverage.

Closes the coverage gap disclosed in PR #1359: previously only SSR-extraction unit tests asserted the head-string shape via `renderWithHead`. Now the runtime behavior is locked at three layers:

1. **`examples/ssr-showcase/src/routes/font-preload-probe.tsx`** — exercises three `usePreloadFont` calls: a local-origin font, a cross-origin CDN font with explicit type override, and a duplicate of the first (forces the dedup contract).

2. **verify-modes** `ssr-showcase × ssg` cell — asserts the prerendered `dist/font-preload-probe/index.html` contains:
   - `<link rel="preload" as="font" href="/fonts/display-bold.woff2" type="font/woff2" crossorigin="anonymous">` (×1 — dedup'd)
   - `<link rel="preload" as="font" href="https://cdn.example.com/brand.woff2" type="font/woff2" crossorigin="anonymous">`
   - **Dedup contract**: 2 calls with the same href → exactly 1 preload tag.
   - **Type contract**: `type="font/woff2"` present (scanner ignores `as=font` without matching MIME).
   - **CORS contract**: `crossorigin="anonymous"` present (CSS Fonts spec — without it the browser double-fetches).

3. **Real-Chromium e2e** (2 specs in `e2e/ssr-showcase.spec.ts`):
   - Both distinct preloads present in the **initial HTML response** (before hydration — the preload scanner can act on them).
   - Same-href dedup: exactly 1 preload tag for the duplicated href.

**Bisect-verified end-to-end**: removing the `crossorigin: 'anonymous'` default in `usePreloadFont` → verify-modes SSG cell fails with `font-preload-probe: preload missing crossorigin="anonymous"`. Restored → 23/23 cells + 2/2 e2e specs pass.

Same coverage shape PR #1357 brought to `<Image priority>`. The combination of (a) build-artifact assertion in verify-modes + (b) real-Chromium SSR HTML inspection in e2e is the framework's regression gate for any feature emitting tags via `useHead` at render time.

23/23 verify-modes • 2/2 new e2e specs • 11/11 validate-fast • typecheck + lint clean.
