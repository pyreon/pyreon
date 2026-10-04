// Public API for @pyreon/native-compiler.
import { createCompiler } from './compiler'
import type { EmitOptions, TransformResult } from './types'

export { createCompiler } from './compiler'
export { swiftBackend, kotlinBackend } from './backends'
export { NATIVE_COMPILER_PLUGIN_API_VERSION } from './plugin'
export type * from './plugin'
export type * from './types'
export {
  validateSwift,
  validateSwiftTypecheck,
  // The Linux-viable TYPE gate: strips the emit's framework imports, prepends
  // stubs that mirror the real SwiftUI/PyreonRuntime surface, and type-checks.
  // Exported because a consumer that generates Pyreon source — the scaffolder
  // most of all — needs to prove its output COMPILES, and `validateSwift` is
  // parse-only while `validateSwiftTypecheck` needs a real Apple SDK.
  validateSwiftWithStubs,
  // Several emitted files as ONE module — the only gate that can see a
  // cross-file collision (two files both declaring the same type).
  validateSwiftFilesWithStubs,
  validateKotlin,
  validateKotlinFiles,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  isKotlincAvailable,
  type ValidationResult,
} from './validate'

const defaultCompiler = createCompiler()

/** Compile with the built-in Swift/Kotlin pipeline. */
export function transform(source: string, options: EmitOptions): TransformResult {
  return defaultCompiler.transform(source, options)
}
