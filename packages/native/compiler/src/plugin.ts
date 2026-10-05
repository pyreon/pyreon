import type { EmitOptions, ParseResult, TargetLanguage, TransformResult } from './types'

/** Bump when the plugin protocol or shared IR changes incompatibly. */
export const NATIVE_COMPILER_PLUGIN_API_VERSION = 1 as const

/** Target-neutral module shared by compiler passes and output backends. */
export type CompilerModule = ParseResult
export type CompilerOptions<Target extends string = TargetLanguage> = Omit<
  EmitOptions,
  'target'
> & {
  target: Target
}

export interface CompilerContext {
  readonly source: string
  readonly options: Readonly<CompilerOptions<string>>
  /** Reports a warning attributed to the active plugin or backend. */
  warn(message: string): void
}

export interface CompilerBackend<Target extends string = string> {
  readonly target: Target
  emit(module: CompilerModule, context: CompilerContext): TransformResult
}

export type CompilerPass = (
  module: CompilerModule,
  context: CompilerContext,
) => CompilerModule | void

export interface CompilerPlugin<Target extends string = string> {
  readonly name: string
  readonly apiVersion: typeof NATIVE_COMPILER_PLUGIN_API_VERSION
  /** Source-level IR transformations run before any target preparation. */
  readonly transformIR?: CompilerPass | undefined
  /** Adds backend/runtime metadata after all source-level transformations. */
  readonly prepareIR?: CompilerPass | undefined
  readonly backends?: readonly CompilerBackend<Target>[] | undefined
}

export interface CompilerConfig<Target extends string = never> {
  readonly plugins?: readonly CompilerPlugin<Target>[] | undefined
}

export interface NativeCompiler<Target extends string = TargetLanguage> {
  readonly targets: readonly Target[]
  transform(source: string, options: CompilerOptions<Target>): TransformResult
}
