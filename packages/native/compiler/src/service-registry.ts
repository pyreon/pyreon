import { HOOKS_PLUGIN_NAME } from './built-in-services.generated'
import type { CompilerPlugin, ServiceSpec } from './plugin'
import type { ServiceDescriptor } from './services'

/**
 * Name of the built-in plugin that carries the `@pyreon/hooks` service table
 * (see `plugins/services.ts`). Also the owner recorded for those hooks. It is the
 * library's own package name so the library's discovered plugin replaces it.
 */
export const BUILT_IN_SERVICE_OWNER = HOOKS_PLUGIN_NAME

export interface RegisteredService {
  readonly descriptor: ServiceDescriptor
  /** The plugin (or {@link BUILT_IN_SERVICE_OWNER}) that claimed the hook. */
  readonly owner: string
  /** Import specifiers the owning plugin serves (`CompilerPlugin.modules`), when it declared any. */
  readonly modules?: readonly string[] | undefined
}

export type ServiceRegistry = ReadonlyMap<string, RegisteredService>

type ServicePlugin = Pick<CompilerPlugin, 'name' | 'services' | 'modules'>

/** A descriptor list as the `services` record a plugin would declare. */
export function serviceSpecsOf(
  descriptors: readonly ServiceDescriptor[],
): Record<string, ServiceSpec> {
  const specs: Record<string, ServiceSpec> = {}
  for (const { hook, ...spec } of descriptors) specs[hook] = spec
  return specs
}

/**
 * Hook → descriptor + owner, from every plugin's `services` — the compiler's
 * own hooks arrive the same way, through the built-in services plugin, so there
 * is no private table beside this one. Two owners for one hook is an error:
 * silently picking one would make the emitted code depend on plugin order,
 * which the app cannot see.
 *
 * @example
 * const registry = createServiceRegistry([builtInServices, { name: '@acme/camera', services: { useShare: … } }])
 * // throws: hook "useShare" is claimed by both "@pyreon/hooks" and "@acme/camera"
 */
export function createServiceRegistry(plugins: readonly ServicePlugin[]): ServiceRegistry {
  const registry = new Map<string, RegisteredService>()
  for (const plugin of plugins) {
    for (const [hook, spec] of Object.entries(plugin.services ?? {})) {
      const existing = registry.get(hook)
      if (existing !== undefined) {
        throw new Error(
          `[Pyreon] hook "${hook}" is claimed by both "${existing.owner}" and "${plugin.name}". ` +
            `A hook has exactly one lowering — remove one of the two plugins from this app, or rename the hook in the plugin that should keep it.`,
        )
      }
      registry.set(hook, {
        descriptor: { ...spec, hook, legacyKind: spec.legacyKind ?? 'service' },
        owner: plugin.name,
        ...(plugin.modules !== undefined ? { modules: plugin.modules } : {}),
      })
    }
  }
  return registry
}

/**
 * Tables the parser and emitters read at hot sites, derived ONCE when the
 * registry is built (never per call). Registry order is preserved, so a
 * built-in-only compile iterates in the same order the old `SERVICES` array did.
 */
export interface ServiceTables {
  /** Every descriptor, in registry order. */
  readonly descriptors: readonly ServiceDescriptor[]
  readonly byHook: ReadonlyMap<string, ServiceDescriptor>
  /** Every service hook name. */
  readonly hooks: ReadonlySet<string>
  /** Hooks whose descriptor declares `destructure`. */
  readonly destructureHooks: ReadonlySet<string>
}

export function createServiceTables(registry: ServiceRegistry): ServiceTables {
  const descriptors = [...registry.values()].map((entry) => entry.descriptor)
  return Object.freeze({
    descriptors,
    byHook: new Map(descriptors.map((d) => [d.hook, d])),
    hooks: new Set(descriptors.map((d) => d.hook)),
    destructureHooks: new Set(descriptors.filter((d) => d.destructure === true).map((d) => d.hook)),
  })
}

/**
 * Order plugins so each follows everything it `requires`. Stable: among the
 * plugins that are ready, the one that came first in the input runs first, so
 * a plugin list with no `requires` keeps its order exactly.
 */
export function orderPlugins<T extends Pick<CompilerPlugin, 'name' | 'requires'>>(
  plugins: readonly T[],
): T[] {
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]))
  for (const plugin of plugins) {
    for (const required of plugin.requires ?? []) {
      if (!byName.has(required)) {
        throw new Error(
          `[Pyreon] Plugin "${plugin.name}" requires plugin "${required}", which is not loaded. ` +
            `Install the package that provides it, or pass it with --plugin.`,
        )
      }
    }
  }
  const ordered: T[] = []
  const placed = new Set<string>()
  const remaining = [...plugins]
  while (remaining.length > 0) {
    const index = remaining.findIndex((plugin) =>
      (plugin.requires ?? []).every((required) => placed.has(required)),
    )
    if (index === -1) {
      throw new Error(
        `[Pyreon] Native compiler plugins form a requires cycle: ${remaining.map((p) => `"${p.name}"`).join(', ')}. Break the cycle so one of them no longer requires the other.`,
      )
    }
    const [next] = remaining.splice(index, 1)
    ordered.push(next!)
    placed.add(next!.name)
  }
  return ordered
}

export interface DiscoveredSelection<T extends CompilerPlugin> {
  /** Discovered plugins that should be loaded, in discovery order. */
  readonly kept: T[]
  /** Names of built-in plugins a discovered plugin replaced. */
  readonly replaced: string[]
}

/**
 * Identity is by NAME. A discovered plugin replaces a same-named `builtIn`
 * plugin silently (the library now ships the lowering the compiler used to);
 * an explicit plugin of the same name wins over the discovered one (the app
 * asked for it); two discovered plugins sharing a name is a real conflict.
 */
export function selectDiscovered<T extends CompilerPlugin>(
  builtIn: readonly Pick<CompilerPlugin, 'name' | 'builtIn'>[],
  explicit: readonly Pick<CompilerPlugin, 'name'>[],
  discovered: readonly T[],
): DiscoveredSelection<T> {
  // `explicit` is unvalidated caller input here: createCompiler reports a bad
  // entry with its own message, so this only has to not crash on one.
  const explicitNames = new Set(
    explicit.map((plugin) => (plugin as { name?: unknown } | null)?.name),
  )
  const replaceable = new Set(builtIn.filter((p) => p.builtIn === true).map((p) => p.name))
  const kept: T[] = []
  const replaced: string[] = []
  const seen = new Set<string>()
  for (const plugin of discovered) {
    if (seen.has(plugin.name)) {
      throw new Error(
        `[Pyreon] Duplicate native compiler plugin "${plugin.name}" discovered twice. Use unique plugin names.`,
      )
    }
    seen.add(plugin.name)
    if (explicitNames.has(plugin.name)) continue
    if (replaceable.has(plugin.name)) replaced.push(plugin.name)
    kept.push(plugin)
  }
  return { kept, replaced }
}
