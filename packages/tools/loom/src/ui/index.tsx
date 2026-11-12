/**
 * `@pyreon/loom/ui` — the observatory workbench. `mountObservatory` is what
 * the dev server's virtual entry calls; `<Observatory>` is exported for hosts
 * that embed it themselves.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import type { LoomReport } from '../core/types'
import { Observatory } from './Observatory'

export { Observatory } from './Observatory'
export {
  createModel,
  buildNodes,
  layoutGraph,
  impactRows,
  pathTo,
  shortName,
  blastRadius,
  versionMatrix,
  scanSummary,
} from './model'
export type {
  ObservatoryModel,
  NodeVM,
  ViewId,
  NodeStatus,
  MatrixMode,
  Severity,
  VersionMatrix,
  VersionRow,
  VersionCell,
  ScanSummary,
} from './model'
export { tokens, hexToRgba, ACCENT, cssVars } from './theme'
import { ensureGlobalStyles } from './global-css'
export { GLOBAL_CSS, ensureGlobalStyles } from './global-css'
export type { LoomTokens } from './theme'

/**
 * The scan-failed state (a manifest mid-edit that no longer parses): the
 * reason, in the observatory's own theme, and a way to try again. The dev
 * server's entry mounts it when the report request fails.
 */
export function ScanError(props: { message: string }) {
  ensureGlobalStyles()
  return (
    <div class="lm-err" data-testid="scan-error">
      <section role="alert">
        <h1>The scan failed</h1>
        <p>Loom could not read this workspace. Fix what the message names, then reload.</p>
        <pre>{props.message}</pre>
        <button
          type="button"
          // Reloading re-runs the scan (the dev server rescans per request).
          onClick={(e: Event) =>
            (e.currentTarget as HTMLElement).ownerDocument.defaultView?.location.reload()
          }
        >
          Reload
        </button>
      </section>
    </div>
  )
}

export function mountScanError(target: Element, message: string): void {
  mount(h(ScanError, { message }), target)
}

export function mountObservatory(
  target: Element,
  report: LoomReport,
  options?: { brand?: string },
): void {
  mount(h(Observatory, { report, ...(options?.brand ? { brand: options.brand } : {}) }), target)
}
