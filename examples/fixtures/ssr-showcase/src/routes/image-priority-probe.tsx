/**
 * /image-priority-probe — exercises `<Image priority>` end-to-end.
 *
 * Used by:
 *   - `verify-modes ssr-showcase × ssg` cell — asserts the prerendered
 *     `dist/image-priority-probe/index.html` carries the preload <link>.
 *   - `e2e/ssr-showcase` (priority-preload spec) — real Chromium loads
 *     the route and asserts the preload tag is in the SSR'd HTML
 *     BEFORE hydration runs (preload-scanner can see it).
 *
 * The route uses a bare string URL + explicit width/height/srcset so the
 * showcase build doesn't need a real `?optimize` import (which would
 * require a fixture image + sharp at build time). The runtime emit logic
 * is identical to the descriptor case — `useImage` reads the same fields.
 */
import { Image } from '@pyreon/zero'

export default function ImagePriorityProbe() {
  return (
    <main data-testid="image-priority-probe">
      <h1>Image Priority Probe</h1>
      <Image
        src="https://cdn.example.com/hero-1920.jpg"
        alt="LCP image"
        width={1920}
        height={1080}
        srcset="https://cdn.example.com/hero-640.jpg 640w, https://cdn.example.com/hero-1920.jpg 1920w"
        priority
      />
    </main>
  )
}
