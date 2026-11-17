/**
 * /font-preload-probe — exercises `usePreloadFont` end-to-end.
 *
 * Used by:
 *   - `verify-modes ssr-showcase × ssg` cell — asserts the prerendered
 *     `dist/font-preload-probe/index.html` carries the `<link rel="preload"
 *     as="font">` tag with correct type + crossorigin.
 *   - `e2e/ssr-showcase` (font-preload spec) — real Chromium loads the
 *     route and asserts the preload tag is in the SSR'd HTML BEFORE
 *     hydration runs (preload-scanner can see it).
 *
 * Two preloads emitted, both sharing the same href on purpose so the
 * dedup spec asserts ONE preload, not two (verifies @pyreon/head's
 * LinkTag href-keying).
 */
import { usePreloadFont } from '@pyreon/zero'

export default function FontPreloadProbe() {
  // Local-origin font (no crossorigin needed... but CSS Fonts spec
  // requires `crossorigin="anonymous"` on every font preload — the
  // helper sets it by default).
  usePreloadFont('/fonts/display-bold.woff2')
  // Cross-origin CDN font + explicit override of type.
  usePreloadFont('https://cdn.example.com/brand.woff2', { type: 'font/woff2' })
  // Duplicate — same href as the first. The dedup contract collapses
  // these to ONE preload tag.
  usePreloadFont('/fonts/display-bold.woff2')
  return (
    <main data-testid="font-preload-probe">
      <h1>Font Preload Probe</h1>
      <p>This route exercises `usePreloadFont` via real SSR + preload-scanner.</p>
    </main>
  )
}
