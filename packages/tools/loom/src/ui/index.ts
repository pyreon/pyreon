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

/**
 * The observatory's global keyframes + the graph's SVG classes — injected
 * once at mount. SVG elements can't be rocketstyle components (Element is
 * HTML-only), but their STATIC styling still belongs in classes; only
 * theme-token paints and per-node data (opacity, weights, geometry) ride as
 * attributes on the elements themselves.
 */
const GLOBAL_CSS = `
@keyframes lm-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes lm-dash{to{stroke-dashoffset:-16}}
@keyframes lm-pulse{0%,100%{opacity:.35}50%{opacity:.9}}
.lm-svg{display:block}
.lm-gnode{cursor:pointer;transition:opacity .16s}
.lm-glabel{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:500;pointer-events:none;paint-order:stroke;stroke-width:3.5px}
.lm-glabel--sel{font-weight:600}
.lm-gsub{font-family:'JetBrains Mono',monospace;font-size:9.5px;pointer-events:none;paint-order:stroke;stroke-width:3px}
.lm-gaxis{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.1em}
.lm-gedge--cyc{animation:lm-dash 1.1s linear infinite}
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
