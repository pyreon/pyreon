/**
 * Instance-owned registries, and the SCOPED slot that lets the parser and the
 * emitters read them.
 *
 * Every `createCompiler` instance owns one {@link CompilerRegistries}, built
 * from its built-in + discovered + explicit plugins. The parser and the two
 * emitters are large and keep module-level state, so they are not handed a
 * registry per call; instead `transform` installs its registries in a slot for
 * exactly the duration of parse + emit and restores whatever was there before.
 *
 * This is NOT global plugin state. The slot holds a value only INSIDE a
 * `withRegistries` call: it is saved and restored in `finally` (stack
 * discipline), so a nested `transform` on another compiler sees its own
 * registries and the outer one is back afterwards, and a throw never leaves a
 * stale value behind. Outside any call it is empty and lookups fall back to the
 * default built-in registries — which are immutable and shared, because they
 * hold no plugin-supplied data. Synchronous only: every compiler hook is.
 */

import { BUILT_IN_PLUGINS } from './built-in-plugins'
import { createCallRegistry, type CallRegistry } from './call-lowering'
import { createElementRegistry, type ElementRegistry } from './element-lowering'
import type { CompilerPlugin } from './plugin'
import { createExprRegistry, type ExprRegistry } from './expr-lowering'
import { createItemRegistry, type ItemRegistry } from './module-items'
import {
  createParseRefinements,
  createPropsTypeRegistry,
  createRuntimeTypeRegistry,
  type RegisteredParseRefinement,
  type RegisteredPropsType,
} from './parse-extensions'
import { createScanRegistry, type ScanRegistry } from './module-scan'
import { createScopeRegistry, type ScopeRegistry } from './scope-provider'
import { createPersistenceRegistry, type RegisteredPersistence } from './signal-persistence'
import { createUnloweredRegistry, type RegisteredUnlowered } from './unlowered-modules'
import {
  createServiceRegistry,
  createServiceTables,
  orderPlugins,
  type ServiceRegistry,
  type ServiceTables,
} from './service-registry'

export interface CompilerRegistries {
  /** Hook → descriptor + owner. */
  readonly services: ServiceRegistry
  /** Tables derived once from `services` (hook sets, registry-order list). */
  readonly serviceTables: ServiceTables
  /** `(module, tag)` → element lowering + owner. */
  readonly elements: ElementRegistry
  /** `(module, tag)` → colour-scope provider + owner. */
  readonly scopes: ScopeRegistry
  /** Hook name → call recognizer, and `(plugin, type)` → declaration emitter. */
  readonly calls: CallRegistry
  /** Module → plugin-supplied unlowered-module metadata (advice + the exports that do lower). */
  readonly unlowered: ReadonlyMap<string, RegisteredUnlowered>
  /** Runtime-declared type name → owning plugin (resolved as known types by the parser). */
  readonly runtimeTypes: ReadonlyMap<string, string>
  /** Plugin parse refinements, in plugin order. */
  readonly parseRefinements: readonly RegisteredParseRefinement[]
  /** Props type name → resolver (a library's imported props types the parser resolves to object shapes). */
  readonly propsTypes: ReadonlyMap<string, RegisteredPropsType>
  /** Receiver, function, member-read, intrinsic and preparation hooks. */
  readonly exprs: ExprRegistry
  /** Per-file scanners, request sources and destructurable hooks. */
  readonly scan: ScanRegistry
  /** The one plugin that renders persisted signals (`CompilerPlugin.persistence`), if any is loaded. */
  readonly persistence: RegisteredPersistence | undefined
  /** File-scope item recognizers and emitters, method-call recognizers, `ext-expr` emitters, struct refinements and module finishers. */
  readonly items: ItemRegistry
}

/**
 * Build the registries for an ALREADY ORDERED plugin list. Throws on a hook or
 * `(module, tag)` claimed by two owners.
 */
export function createRegistries(ordered: readonly CompilerPlugin[]): CompilerRegistries {
  const services = createServiceRegistry(ordered)
  const calls = createCallRegistry(ordered)
  // A name with a service descriptor AND a recognizer would be lowered by
  // whichever branch the parser reaches first — decide it here, loudly.
  for (const [name, call] of calls.calls) {
    const service = services.get(name)
    if (service !== undefined) {
      throw new Error(
        `[Pyreon] hook "${name}" is claimed by both "${service.owner}" (services) and "${call.owner}" (calls). ` +
          `A hook has exactly one lowering — remove one of the two plugins from this app.`,
      )
    }
  }
  const exprs = createExprRegistry(ordered)
  // A function name is claimed like a hook; two claimants would lower it by
  // whichever branch the parser reaches first.
  for (const [name, fn] of exprs.functions) {
    const service = services.get(name)
    const call = calls.calls.get(name)
    const other = service?.owner ?? call?.owner
    if (other !== undefined) {
      throw new Error(
        `[Pyreon] "${name}" is claimed by both "${other}" (a hook) and "${fn.owner}" (functions). ` +
          `A name has exactly one lowering — remove one of the two plugins from this app.`,
      )
    }
  }
  return Object.freeze({
    services,
    serviceTables: createServiceTables(services),
    elements: createElementRegistry(ordered),
    scopes: createScopeRegistry(ordered),
    calls,
    unlowered: createUnloweredRegistry(ordered),
    runtimeTypes: createRuntimeTypeRegistry(ordered),
    parseRefinements: createParseRefinements(ordered),
    propsTypes: createPropsTypeRegistry(ordered),
    exprs,
    scan: createScanRegistry(ordered),
    items: createItemRegistry(ordered),
    persistence: createPersistenceRegistry(ordered),
  })
}

let defaults: CompilerRegistries | undefined

/** The registries of a compiler with only the built-in plugins. Immutable and shared. */
export function defaultRegistries(): CompilerRegistries {
  defaults ??= createRegistries(orderPlugins(BUILT_IN_PLUGINS))
  return defaults
}

let current: CompilerRegistries | undefined

/** The registries of the `withRegistries` call being run, else the built-in defaults. */
export function activeRegistries(): CompilerRegistries {
  return current ?? defaultRegistries()
}

/**
 * Run `fn` with `registries` active, then restore the previous slot value —
 * also when `fn` throws.
 *
 * @example
 * const code = withRegistries(compiler.registries, () => emitSwift(...))
 */
export function withRegistries<T>(registries: CompilerRegistries, fn: () => T): T {
  const previous = current
  current = registries
  try {
    return fn()
  } finally {
    current = previous
  }
}
