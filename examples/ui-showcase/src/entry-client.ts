import { routes } from 'virtual:zero/routes'
import { onHydrationMismatch } from '@pyreon/runtime-dom'
import { startClient } from '@pyreon/zero/client'

// E2E hook for the hydration-mismatch telemetry test. Records every
// captured mismatch on `window.__pyreonHydrationMismatches__` so a
// Playwright spec can assert the callback fired in a REAL browser
// (not just the happy-dom unit tests). Cheap, dev-only side effect:
// the array is empty in normal sessions and only populated when
// SSR/client output diverge.
declare global {
  interface Window {
    __pyreonHydrationMismatches__?: Array<{
      type: string
      expected: unknown
      actual: unknown
      path: string
      timestamp: number
    }>
  }
}
window.__pyreonHydrationMismatches__ = []
onHydrationMismatch((ctx) => {
  window.__pyreonHydrationMismatches__?.push({
    type: ctx.type,
    expected: ctx.expected,
    actual: ctx.actual,
    path: ctx.path,
    timestamp: ctx.timestamp,
  })
})

// fs-router emits `_layout.tsx` as a parent route in the matched chain.
// Passing `layout` to `startClient` is redundant (and contributes to
// the double-mount bug-shape PR #349 partially fixed for ssr-showcase).
// Mirroring the ssr-showcase entry-client pattern post-#349.
startClient({ routes })
