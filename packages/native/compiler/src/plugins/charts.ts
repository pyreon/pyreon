import { CHART_ENGINE_DECLARED_NAMES, CHART_ENGINE_STRUCTS } from '../chart-engine-structs'
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

/** Runtime-provided chart structs participate in inference, but are not emitted. */
export const chartsPlugin: CompilerPlugin<never> = Object.freeze({
  name: '@pyreon/charts',
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  builtIn: true,
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
