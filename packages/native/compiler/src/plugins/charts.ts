import { CHART_ENGINE_DECLARED_NAMES, CHART_ENGINE_STRUCTS } from '../chart-engine-structs'
import type { DeclEmitter } from '../call-lowering'
import type { DeclIR, ExtDecl } from '../types'
import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CompilerModule,
  type CompilerPlugin,
} from '../plugin'

const ENTRYPOINTS = new Set([
  '@pyreon/charts',
  '@pyreon/charts/engine',
  '@pyreon/charts/option',
  '@pyreon/charts/svg',
])
const ENGINE_NAMES = new Set(CHART_ENGINE_DECLARED_NAMES)

export const CHARTS_PLUGIN_NAME = '@pyreon/charts'
export const CHART_HANDLE_TYPE = 'chart-handle'

/**
 * The Swift constructor argument is the bound chart's series count, which only
 * the BODY emit knows. The declaration writes this placeholder and the component
 * emit substitutes it once the body has been emitted.
 */
export const chartHandleSeriesPlaceholder = (name: string): string =>
  `__PYREON_HANDLE_SERIES_${name}__`

/** Matches {@link chartHandleSeriesPlaceholder}; capture 1 is the handle name. */
export const CHART_HANDLE_SERIES_PATTERN = /__PYREON_HANDLE_SERIES_(\w+)__/g

/**
 * True for a `const chart = createChartHandle()` declaration. The core still has
 * to know which names are handles — a `handle.dispatch({...})` call and a
 * `<PlotChart handle={chart}>` binding are expression and element lowering that
 * has not moved yet — and it learns them from the declarations, never from a
 * plugin's private state.
 */
export function isChartHandleDecl(d: DeclIR): d is ExtDecl {
  return d.kind === 'ext' && d.plugin === CHARTS_PLUGIN_NAME && d.type === CHART_HANDLE_TYPE
}

const chartHandleDecl = Object.freeze<DeclEmitter>({
  // Hashed by `moduleTag` as the `chart-handle` kind it was before it became a plugin declaration.
  legacyKind: 'chart-handle',
  swift: (d, ctx) =>
    `@State private var ${ctx.ident(d.name)} = PyreonChartHandle(seriesCount: ${chartHandleSeriesPlaceholder(d.name)})`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonChartHandle() }`,
})

/**
 * `@pyreon/charts` on native. Runtime-provided chart structs participate in
 * inference, but are not emitted; `createChartHandle()` lowers to a
 * PyreonChartHandle — observable fields the bound `<PlotChart handle>` reads and
 * writes, and a `dispatch` that runs the crossing reducer (the dispatch and the
 * host binding are still lowered by the core, which learns the handle names from
 * the declarations).
 */
export const chartsPlugin: CompilerPlugin<never> = Object.freeze({
  name: CHARTS_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  builtIn: true,
  calls: Object.freeze({
    createChartHandle: () => ({ type: CHART_HANDLE_TYPE }),
  }),
  decls: Object.freeze({ [CHART_HANDLE_TYPE]: chartHandleDecl }),
  prepareIR(module: CompilerModule) {
    if (!module.imports.some((source) => ENTRYPOINTS.has(source))) return
    const declared = [...module.structs.map((s) => s.name), ...module.enums.map((e) => e.name)]
    for (const name of [...new Set(declared.filter((n) => ENGINE_NAMES.has(n)))].sort()) {
      module.warnings.push(
        `\`${name}\` is also the name of a type in the generated chart engine, and this file uses \`@pyreon/charts\` — your declaration SHADOWS the engine's, ` +
          `so the native build fails (\`invalid redeclaration of '${name}'\` in the compile gates; a type mismatch at every engine call in an app). Rename yours.`,
      )
    }
    module.structs = [...module.structs, ...CHART_ENGINE_STRUCTS]
  },
})
