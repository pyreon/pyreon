/**
 * `@pyreon/charts` host elements → Jetpack Compose. The plugin's `emit.kotlin` entry.
 *
 * The emitters live in `kotlin-hosts.ts` (the host dispatch and the table-driven /
 * accessor / frame hosts), `kotlin-plot.ts` (`<PlotChart>`) and `kotlin-support.ts`
 * (the shared canvas, chrome, theme and gesture helpers) — the Compose mirror of
 * `swift*.ts`. They read the compiler through the facade (`kotlin-facade.ts`),
 * which this entry installs for the duration of one element.
 */

import type { EmitContext } from '../../emit-context'
import type { JsxElementIR } from '../../types'
import { withKotlinContext } from './kotlin-facade'
import { emitKotlinChartHost } from './kotlin-hosts'

export function emitKotlinChartElement(el: JsxElementIR, ctx: EmitContext): string {
  return withKotlinContext(ctx, () => emitKotlinChartHost(el, ctx.indent))
}
