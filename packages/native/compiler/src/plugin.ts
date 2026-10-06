import type { CompilerRegistries } from './active-registries'
import type { CallRecognizer, DeclEmitter } from './call-lowering'
import type { ElementLowering } from './element-lowering'
import type { ServiceDescriptor } from './services'
import type { ServiceRegistry } from './service-registry'
import type { EmitOptions, ParseResult, TargetLanguage, TransformResult } from './types'

/**
 * Bump ONLY when the plugin protocol or shared IR changes incompatibly.
 * Additive optional fields (`services`, `elements`, `calls`, `decls`, `modules`, `requires`, `builtIn`) never
 * bump it — an older plugin simply does not use them.
 */
export const NATIVE_COMPILER_PLUGIN_API_VERSION = 1 as const

/** Every plugin `apiVersion` this compiler can load. */
export const SUPPORTED_PLUGIN_API_VERSIONS: readonly number[] = Object.freeze([
  NATIVE_COMPILER_PLUGIN_API_VERSION,
])

/**
 * One service a plugin contributes: a {@link ServiceDescriptor} without its
 * `hook` (the hook is the key of {@link CompilerPlugin.services}). Derived from
 * the descriptor type so it follows when the descriptor vocabulary grows.
 */
export type ServiceSpec = Omit<ServiceDescriptor, 'hook' | 'legacyKind'> & {
  /**
   * Only the compiler's own built-in hooks need this (it keeps their emitted
   * names byte-identical to before they were descriptors). A plugin has no
   * prior output to preserve, so it is optional and defaults to `'service'`.
   */
  readonly legacyKind?: string | undefined
}

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
  /**
   * Hook name → service descriptor + owning plugin, built once at
   * `createCompiler` time. The parser and emitters read the same registry
   * (through the compiler's scoped registries), so a plugin's hook is lowered
   * on both targets.
   */
  readonly services: ServiceRegistry
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
  /**
   * Plain service hooks this plugin lowers, keyed by hook name (`useShare`).
   * Two owners for one hook is a load-time error — the app must pick one.
   */
  readonly services?: Readonly<Record<string, ServiceSpec>> | undefined
  /**
   * JSX element lowerings this plugin contributes: tags imported from a
   * package that retag to another element or emit target code through the
   * `EmitContext` facade. A `(module, tag)` pair claimed by two owners is a
   * load-time error naming both.
   */
  readonly elements?: readonly ElementLowering[] | undefined
  /**
   * Calls this plugin RECOGNIZES, keyed by hook / function name
   * (`createChartHandle`). A recognizer reads the call through the `ParseContext`
   * facade and returns the plugin's own declaration (type + JSON payload), or
   * `undefined` to decline — the parser then continues as if the plugin were
   * absent. A name is claimed under the same rule as a `services` hook: when it
   * is imported from `@pyreon/*` or from one of `modules`. Two owners for one
   * name is a load-time error. Pair it with `decls`.
   */
  readonly calls?: Readonly<Record<string, CallRecognizer>> | undefined
  /**
   * How this plugin's declarations render on each target, keyed by the
   * declaration `type` a `calls` recognizer returns. The emitter receives the
   * `EmitContext` facade and returns declaration text.
   */
  readonly decls?: Readonly<Record<string, DeclEmitter>> | undefined
  /**
   * Import specifiers this plugin serves (`@acme/camera`, matched exactly or as
   * a `name/` prefix). A hook in `services` is claimed when it is imported from
   * `@pyreon/*` OR from one of these — so a package-owned plugin's hook lowers
   * from its own package. A package-owned plugin is also lazily activated from
   * the `pyreon.native.modules` manifest field, because that decision must be
   * made WITHOUT loading the plugin.
   */
  readonly modules?: readonly string[] | undefined
  /** Names of other plugins that must be loaded; also orders the passes. */
  readonly requires?: readonly string[] | undefined
  /** Marks a compiler-shipped plugin that a discovered plugin may replace by name. */
  readonly builtIn?: boolean | undefined
  /** Source-level IR transformations run before any target preparation. */
  readonly transformIR?: CompilerPass | undefined
  /** Adds backend/runtime metadata after all source-level transformations. */
  readonly prepareIR?: CompilerPass | undefined
  readonly backends?: readonly CompilerBackend<Target>[] | undefined
}

export interface CompilerConfig<Target extends string = never> {
  readonly plugins?: readonly CompilerPlugin<Target>[] | undefined
  /**
   * Plugins found by package discovery. Unlike `plugins`, a discovered plugin
   * whose name equals a `builtIn` plugin REPLACES it silently, and an explicit
   * plugin of the same name wins over a discovered one.
   */
  readonly discovered?: readonly CompilerPlugin<Target>[] | undefined
}

export interface NativeCompiler<Target extends string = TargetLanguage> {
  readonly targets: readonly Target[]
  /** The service registry every pass sees (built-in + plugin services). */
  readonly services: ServiceRegistry
  /** Everything this instance owns: services, derived tables, element lowerings. */
  readonly registries: CompilerRegistries
  transform(source: string, options: CompilerOptions<Target>): TransformResult
}
