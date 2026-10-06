import { emitKotlin } from './emit-kotlin'
import { emitSwift } from './emit-swift'
import type { CompilerBackend, CompilerModule, CompilerContext } from './plugin'

// Adapt legacy emitter signatures at one boundary. Passes and third-party
// backends receive the named module, never a positional list of IR sections.
function emitNative(emit: typeof emitSwift, module: CompilerModule, context: CompilerContext) {
  return emit(
    module.components,
    module.enums,
    module.structs,
    module.moduleDecls,
    module.stores,
    module.models,
    module.fieldMetas,
    module.features,
    module.zodSchemas,
    module.moduleItems,
    context.options.fonts ?? {},
    module.helperFns,
    module.styledComponents,
    module.rocketstyleComponents,
    module.attrsComponents,
    module.aliasImports,
  )
}

/** Built-in Swift emitter adapter for explicitly delegated backend plugins.
 * @example
 * const backend = { target: 'swift-preview', emit: swiftBackend.emit }
 */
export const swiftBackend: CompilerBackend<'swift'> = Object.freeze({
  target: 'swift',
  emit: (module: CompilerModule, context: CompilerContext) =>
    emitNative(emitSwift, module, context),
})
/** Built-in Kotlin emitter adapter for explicitly delegated backend plugins.
 * @example
 * const backend = { target: 'kotlin-preview', emit: kotlinBackend.emit }
 */
export const kotlinBackend: CompilerBackend<'kotlin'> = Object.freeze({
  target: 'kotlin',
  emit: (module: CompilerModule, context: CompilerContext) =>
    emitNative(emitKotlin, module, context),
})
