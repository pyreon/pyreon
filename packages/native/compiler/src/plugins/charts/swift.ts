/**
 * `@pyreon/charts` host elements → SwiftUI. The plugin's `emit.swift` entry.
 *
 * The emitters live in `swift-hosts.ts` (the host dispatch and the table-driven /
 * accessor / frame hosts), `swift-plot.ts` (`<PlotChart>`) and `swift-support.ts`
 * (the shared canvas, chrome, theme and gesture helpers). They read the compiler
 * through the facade (`swift-facade.ts`), which this entry installs for the
 * duration of one element.
 */

import type { SwiftEmitContext } from '../../emit-context'
import type { JsxElementIR } from '../../types'
import { withSwiftContext } from './swift-facade'
import { emitSwiftChartHost } from './swift-hosts'

export function emitSwiftChartElement(el: JsxElementIR, ctx: SwiftEmitContext): string {
  return withSwiftContext(ctx, () => emitSwiftChartHost(el, ctx.indent))
}
