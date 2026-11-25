/**
 * `@pyreon/zero/dev-overlay` — the in-browser half of zero's development
 * error overlay. Not for application code.
 *
 * `zero()` injects a module that calls `installDevOverlay()` into every page
 * the DEV server sends (never into a build), ahead of the app's entry, so the
 * handler is registered before hydration starts. When hydration reports a
 * mismatch, the overlay opens over the page in a shadow root: the runtime's
 * own warning, what the server rendered against what the client rendered,
 * where in the tree, the diagnose fix when the catalog has one, and the
 * stack at the moment of the report.
 *
 * Hydration mismatches carry no source location (the runtime only knows the
 * DOM path), so this overlay shows no file link or code frame.
 */
import { isServer } from '@pyreon/reactivity'
import { onHydrationMismatch } from '@pyreon/runtime-dom'
import type { HydrationMismatchContext } from '@pyreon/runtime-dom'
import type { OverlayReport } from './overlay/model'
import { OVERLAY_CSS, overlayBehaviour, preferredTheme, renderOverlayMarkup } from './overlay/view'
import { buildHydrationReport } from './hydration-report'

const HOST_TAG = 'pyreon-dev-overlay'

/** Mount the overlay for `report` over the page. Returns the host element. */
export function showDevOverlay(report: OverlayReport): HTMLElement | undefined {
  if (isServer) return undefined
  document.querySelector(HOST_TAG)?.remove()
  const host = document.createElement(HOST_TAG)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${OVERLAY_CSS}</style>${renderOverlayMarkup(report, { mode: 'inline' })}`
  const theme = preferredTheme()
  if (theme) shadow.querySelector('[data-pz-ol]')?.setAttribute('data-theme', theme)
  document.body.appendChild(host)
  overlayBehaviour(shadow)
  return host
}

let installed: (() => void) | undefined

/**
 * Register the hydration-mismatch handler. Idempotent; returns the unregister
 * function. A no-op in production builds.
 */
export function installDevOverlay(): () => void {
  if (process.env.NODE_ENV === 'production') return () => {}
  if (installed) return installed
  let first: { ctx: HydrationMismatchContext; stack: string | undefined } | undefined
  let more = 0
  let scheduled = false
  const off = onHydrationMismatch((ctx) => {
    if (first) {
      more++
    } else {
      first = { ctx, stack: new Error('hydration mismatch').stack }
    }
    if (scheduled) return
    scheduled = true
    // Mount after hydration finishes: touching <body> mid-hydration would
    // itself shift the tree being hydrated.
    setTimeout(() => {
      scheduled = false
      if (!first) return
      const { ctx: c, stack } = first
      const extra = more
      first = undefined
      more = 0
      showDevOverlay(buildHydrationReport(c, stack, extra))
    }, 0)
  })
  installed = () => {
    off()
    installed = undefined
  }
  return installed
}
