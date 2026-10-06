import type { CompilerRegistries } from './active-registries'
import type { CallRecognizer, DeclEmitter, MemberCallLowering } from './call-lowering'
import type { ElementLowering } from './element-lowering'
import type {
  EmitPreparation,
  FunctionLowering,
  IdentifierLowering,
  IntrinsicLowering,
  MemberReadLowering,
  ReceiverLowering,
} from './expr-lowering'
import type { ModuleScanner, RequestSource } from './module-scan'
import type {
  ExprEmitter,
  MethodCallRecognizer,
  ModuleFinish,
  ModuleItemEmitter,
  StructRefinement,
  TopLevelRecognizer,
} from './module-items'
import type { ParseRefinement, PropsTypeResolver } from './parse-extensions'
import type { ScopeProvider } from './scope-provider'
import type { StubAugmentation } from './stub-augmentation'
import type { ServiceDescriptor } from './services'
import type { ServiceRegistry } from './service-registry'
import type { UnloweredSpec } from './unlowered-modules'
import type { EmitOptions, ParseResult, TargetLanguage, TransformResult } from './types'

/**
 * Bump ONLY when the plugin protocol or shared IR changes incompatibly.
 * Additive optional fields (`services`, `elements`, `calls`, `decls`, `memberCalls`, `unlowered`, `modules`, `requires`, `builtIn`) never
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
   * Colour-scope providers this plugin contributes: compile-time scopes entered
   * by `<PyreonUI mode>` / `<ColorModeProvider mode>` (or an element of the
   * plugin's own) while their children are emitted, read back by the plugin's
   * own elements through `EmitContext.colorScope()`. A `(module, tag)` pair
   * claimed by two owners is a load-time error naming both.
   */
  readonly scopes?: readonly ScopeProvider[] | undefined
  /**
   * Type-gate stub text this plugin's emit needs beyond the SwiftUI / Compose
   * stub bundle (see {@link StubAugmentation}). The compiler never reads it; a
   * caller of the compile gates passes it as `ValidateOptions.augment`.
   */
  readonly stubs?: StubAugmentation | undefined
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
   * Call EXPRESSIONS this plugin lowers, keyed by method name (`dispatch`):
   * `<receiver>.<method>(…)` where `<receiver>` is a binding one of THIS plugin's
   * `decls` created. The plugin never sees a call on any other receiver, so two
   * plugins may both claim `dispatch` — the receiver decides. Each target returns
   * the expression text, or `undefined` to decline. Requires `decls`.
   */
  readonly memberCalls?: Readonly<Record<string, MemberCallLowering>> | undefined
  /**
   * Calls, member reads and assignments ROOTED at a binding one of this plugin's
   * `decls` created (`flow.fitView()`, `flow.nodes.set(x)`, `flow.config.zoom =
   * 2`), keyed by the declaration `type`. Generalises `memberCalls`, which sees
   * only the one-hop `<receiver>.<method>(…)` shape. Each target may decline
   * (`undefined`); the expression then emits as without the plugin. Requires `decls`.
   */
  readonly receivers?: Readonly<Record<string, ReceiverLowering>> | undefined
  /**
   * Plain calls `name(args)` this plugin lowers (`getBezierPath({…})`), keyed by
   * function name. The name is claimed like a hook — imported from `@pyreon/*` or
   * one of `modules` — and an aliased import is renamed back to it; a same-named
   * user function or foreign import is left alone. Two owners for one name is a
   * load-time error.
   */
  readonly functions?: Readonly<Record<string, FunctionLowering>> | undefined
  /**
   * Member READS the plugin recognises by shape rather than by root binding
   * (`MarkerType.Arrow`, `props.edge.data.x`). Called for every member read once
   * a plugin registers it, so the first check must be cheap; each target may
   * decline (`undefined`).
   */
  readonly memberReads?: MemberReadLowering | undefined
  /**
   * Bare identifiers that name library constants (`DEFAULT_NODE_WIDTH`), keyed by
   * name. Two owners for one name is a load-time error.
   */
  readonly identifiers?: Readonly<Record<string, IdentifierLowering>> | undefined
  /**
   * Lowercase DOM tags (`path`, `svg`, `div`) the plugin claims while a predicate
   * holds — inside its own renderer components. Unlike `elements` they are not
   * imported from a package, so the claim is the predicate.
   */
  readonly intrinsics?: readonly IntrinsicLowering[] | undefined
  /**
   * A per-file pass each emitter runs after the file's components and module
   * constants are known and before any component is emitted. It may keep
   * file-scoped memory (`EmitContext.fileState`) and return extra components,
   * which are emitted after the file's own and registered like them.
   */
  readonly prepareEmit?: EmitPreparation | undefined
  /**
   * A sentence the "DOM/SVG element has no native lowering" warning appends
   * (`", or, for … , use …"`) when this plugin is loaded: the route the plugin
   * offers for markup it cannot lower. Without it the warning carries only the
   * core's own advice.
   */
  readonly intrinsicAdvice?: string | undefined
  /**
   * Props types the plugin's library exports (`NodeComponentProps<D>`), keyed by
   * the type's name: how each resolves to the object shape a component's
   * parameters are read from. Two owners for one name is a load-time error.
   */
  readonly propsTypes?: Readonly<Record<string, PropsTypeResolver>> | undefined
  /**
   * Unlowered-module metadata for the package(s) this plugin owns, keyed by
   * module: the advice the "has NO native lowering" warning names, and the
   * exports that DO lower and must stay silent. A module supplied by two
   * plugins is a load-time error; a plugin's entry wins over the compiler's own
   * hand-maintained one.
   */
  readonly unlowered?: Readonly<Record<string, UnloweredSpec>> | undefined
  /**
   * Import specifiers this plugin serves (`@acme/camera`, matched exactly or as
   * a `name/` prefix). A hook in `services` is claimed when it is imported from
   * `@pyreon/*` OR from one of these — so a package-owned plugin's hook lowers
   * from its own package. A package-owned plugin is also lazily activated from
   * the `pyreon.native.modules` manifest field, because that decision must be
   * made WITHOUT loading the plugin.
   */
  readonly modules?: readonly string[] | undefined
  /**
   * Type names the plugin's RUNTIME declares (so a helper typed against one,
   * `(c: TooltipContent) => string`, resolves on the target instead of being
   * rejected as an unknown object type). Declaring the type itself in the
   * emitted file is still the plugin's `prepareIR`. Two plugins declaring one
   * name is a load-time error naming both.
   */
  readonly runtimeTypes?: readonly string[] | undefined
  /**
   * An IR→IR edit that must run DURING parse — after components and helper
   * functions are collected, before helper return types are inferred over
   * their parameters. Use it only for what a later `transformIR` would be too
   * late for (e.g. widening a helper's parameter to `Double` so the return
   * type is inferred over it). It receives the live, call-owned IR and
   * mutates it in place; everything else belongs in `transformIR`.
   */
  readonly refineParse?: ParseRefinement | undefined
  /**
   * A per-file pre-pass over the program's top-level nodes (see {@link ModuleScanner}): record
   * plugin-owned facts, make the core skip metadata-only declarations, mark imports that lower.
   */
  readonly scanModule?: ModuleScanner | undefined
  /**
   * Resolvers that turn a call of a binding this plugin recorded (`getUser({ params })`) into a
   * concrete request, read by the core's `useFetch` and by other plugins through
   * `ParseContext.requests`. The first source whose `has` accepts the name resolves it.
   */
  readonly requestSources?: readonly RequestSource[] | undefined
  /**
   * Recognizes this plugin's FILE-SCOPE declarations (`const Pet = s.object({ … })`): called for each
   * top-level node the core did not claim; the first plugin to return an item owns the node, `undefined`
   * declines. Pair it with `items`. See `module-items.ts`.
   */
  readonly topLevel?: TopLevelRecognizer | undefined
  /** How each file-scope item `type` a `topLevel` recognizer (or `addItem`) produces renders on each target. */
  readonly items?: Readonly<Record<string, ModuleItemEmitter>> | undefined
  /**
   * Method calls `<receiver>.<method>(…)` this plugin recognizes by SHAPE, keyed by METHOD name
   * (`safeParse`); the key `'*'` sees EVERY method call, after the recognizers keyed by its own name
   * (for a plugin that must warn about any method on a binding it owns). Each recognizer returns an `ext-expr` spec, `undefined` to decline, or `null` to claim
   * a call it reported as unsupported. Pair it with `exprs`.
   */
  readonly methodCalls?: Readonly<Record<string, MethodCallRecognizer>> | undefined
  /** How each `ext-expr` type a `methodCalls` recognizer produces renders on each target and is typed. */
  readonly exprs?: Readonly<Record<string, ExprEmitter>> | undefined
  /**
   * Edit the file's structs from the module items and from the decode sites other plugins recorded
   * (`ParseContext.recordDecode`). Runs after the core's own struct float refinements, before the
   * inline-object ones that read the field types it settles.
   */
  readonly refineStructs?: StructRefinement | undefined
  /** A last pass over the finished item list (inline-synthesized items included), once per file. */
  readonly finishModule?: ModuleFinish | undefined
  /** Hooks of this plugin whose result may be destructured (`const { data, isPending } = useQuery(…)`). */
  readonly destructureCalls?: readonly string[] | undefined
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
