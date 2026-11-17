/**
 * /link-prefetch-probe — reproduces the @pyreon/zero `<Link>` prefetch bug.
 *
 * Hovering a `<Link>` used to inject `<link rel="modulepreload" href="/about">`
 * — the ROUTE PATH, an SSR HTML URL — so the browser fetched it as a module
 * script and logged strict-MIME "Failed to load module script" on EVERY hover.
 *
 * Used by `e2e/ssr-node.spec.ts` ("zero <Link> prefetch"): real Chromium hovers
 * the link against the built SSR server (route paths return `text/html`) and
 * asserts NO such console error, NO `modulepreload` hint pointing at a route
 * path, and that the valid `rel="prefetch" as="document"` hint IS present.
 *
 * `<Link>` forwards only a fixed prop set (no arbitrary `data-*`), so the probe
 * wrapper carries the testid and the spec selects the inner `a[href="/about"]`.
 */
import { Link } from '@pyreon/zero'

export default function LinkPrefetchProbe() {
  return (
    <main data-testid="link-prefetch-probe">
      <h1>Link prefetch probe</h1>
      <p>Hover the link below — it must warm the route without a strict-MIME error.</p>
      <Link href="/about">About (hover me)</Link>
    </main>
  )
}
