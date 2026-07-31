/**
 * `@pyreon/loom/ui` — the observatory workbench. `mountObservatory` is what
 * the dev server's virtual entry calls; `<Observatory>` is exported for hosts
 * that embed it themselves.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createGlobalStyle } from '@pyreon/styler'
import type { LoomReport } from '../core/types'
import { Observatory } from './Observatory'

export { Observatory } from './Observatory'
export { createModel, buildNodes, layoutGraph, impactRows, pathTo, shortName } from './model'
export type { ObservatoryModel, NodeVM, ViewId, KindFilter, NodeStatus } from './model'
export { tokens, hexToRgba, ACCENT } from './theme'
export type { LoomTokens } from './theme'

/** The observatory's global keyframes — injected once at mount. */
const GLOBAL_CSS = `
@keyframes lm-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes lm-dash{to{stroke-dashoffset:-16}}
@keyframes lm-pulse{0%,100%{opacity:.35}50%{opacity:.9}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{-webkit-font-smoothing:antialiased}
button:focus-visible,input:focus-visible{outline:2px solid ${'#ff6b3d'};outline-offset:2px}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(120,128,150,.3);border-radius:20px;border:3px solid transparent;background-clip:content-box}
`

let globalInjected = false

export function mountObservatory(target: Element, report: LoomReport, options?: { brand?: string }): void {
  if (!globalInjected) {
    globalInjected = true
    createGlobalStyle([GLOBAL_CSS] as unknown as TemplateStringsArray)
  }
  mount(h(Observatory, { report, ...(options?.brand ? { brand: options.brand } : {}) }), target)
}
