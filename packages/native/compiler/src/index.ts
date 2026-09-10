// Public API for @pyreon/native-compiler.
//
// Single entry point: `transform(source, { target })` → emitted code +
// parse warnings. Internal-only (private package); not yet for consumer use.

import { emitKotlin } from './emit-kotlin'
import { emitSwift } from './emit-swift'
import { parsePyreon } from './parse'
import { CHART_ENGINE_DECLARED_NAMES, CHART_ENGINE_STRUCTS } from './chart-engine-structs'
import type { EmitOptions, TransformResult } from './types'

export type { TargetLanguage, EmitOptions, TransformResult } from './types'
export {
  validateSwift,
  validateSwiftTypecheck,
  // The Linux-viable TYPE gate: strips the emit's framework imports, prepends
  // stubs that mirror the real SwiftUI/PyreonRuntime surface, and type-checks.
  // Exported because a consumer that generates Pyreon source — the scaffolder
  // most of all — needs to prove its output COMPILES, and `validateSwift` is
  // parse-only while `validateSwiftTypecheck` needs a real Apple SDK.
  validateSwiftWithStubs,
  validateKotlin,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  isKotlincAvailable,
  type ValidationResult,
} from './validate'

/** A module that imports from `@pyreon/charts/plot` constructs the generated
 *  engine's structs (`SankeyNode`, `GanttTask`, …): their declarations are
 *  known to the emitters as EXTERNAL structs so literals type correctly. */
const CHART_PLOT_IMPORT = /from\s*['"]@pyreon\/charts\/plot['"]/

/**
 * A user type whose NAME matches one the generated chart engine declares
 * SHADOWS it. The emit constructs engine structs by BARE name
 * (`Slice(value:label:)`), so the constructor resolves to the user's type and
 * the native build fails — in the single-file compile gates as an outright
 * `invalid redeclaration of 'Slice'`, in a real two-module app as a type
 * mismatch at every engine call. Neither target lets a type overload, so this
 * is always fatal and always worth a name.
 *
 * It shipped silently once (an example's `interface Slice` against the pie
 * datum's `Slice`) and only `native-examples-compile.test.ts` caught it — a
 * gate that covers this repo's examples and nobody else's.
 */
function chartEngineShadowWarnings(parsed: ReturnType<typeof parsePyreon>): string[] {
  const engine = new Set(CHART_ENGINE_DECLARED_NAMES)
  const declared = [...parsed.structs.map((st) => st.name), ...parsed.enums.map((e) => e.name)]
  return [...new Set(declared.filter((n) => engine.has(n)))]
    .sort()
    .map(
      (n) =>
        `\`${n}\` is also the name of a type in the generated chart engine, and this file uses \`@pyreon/charts/plot\` — your declaration SHADOWS the engine's, `
        + `so the native build fails (\`invalid redeclaration of '${n}'\` in the compile gates; a type mismatch at every engine call in an app). Rename yours.`,
    )
}

export function transform(source: string, options: EmitOptions): TransformResult {
  const parsed = parsePyreon(source, options.filename)
  const usesChartEngine = CHART_PLOT_IMPORT.test(source)
  const structs = usesChartEngine ? [...parsed.structs, ...CHART_ENGINE_STRUCTS] : parsed.structs
  const emitted =
    options.target === 'swift'
      ? emitSwift(
          parsed.components,
          parsed.enums,
          structs,
          parsed.moduleDecls,
          parsed.stores,
          parsed.models,
          parsed.fieldMetas,
          parsed.features,
          parsed.zodSchemas,
          options.fonts ?? {},
          parsed.helperFns,
          parsed.styledComponents,
          parsed.rocketstyleComponents,
          parsed.attrsComponents,
          parsed.aliasImports,
        )
      : emitKotlin(
          parsed.components,
          parsed.enums,
          structs,
          parsed.moduleDecls,
          parsed.stores,
          parsed.models,
          parsed.fieldMetas,
          parsed.features,
          parsed.zodSchemas,
          options.fonts ?? {},
          parsed.helperFns,
          parsed.styledComponents,
          parsed.rocketstyleComponents,
          parsed.attrsComponents,
          parsed.aliasImports,
        )
  // Phase 3 native-readiness gap fix (2026-06-05): emit-time warnings
  // (walled-tag silent-drop diagnostics, etc.) merge with parse-time
  // warnings so consumers see them under a single contract.
  return {
    code: emitted.code,
    warnings: [...parsed.warnings, ...(usesChartEngine ? chartEngineShadowWarnings(parsed) : []), ...emitted.warnings],
  }
}
