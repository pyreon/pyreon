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
export { createModel, buildNodes, layoutGraph, impactRows, pathTo, shortName } from './model'
export type { ObservatoryModel, NodeVM, ViewId, KindFilter, NodeStatus } from './model'
export { tokens, hexToRgba, ACCENT, cssVars } from './theme'
export { GLOBAL_CSS, ensureGlobalStyles } from './global-css'
export type { LoomTokens } from './theme'

export function mountObservatory(
  target: Element,
  report: LoomReport,
  options?: { brand?: string },
): void {
  mount(h(Observatory, { report, ...(options?.brand ? { brand: options.brand } : {}) }), target)
}
