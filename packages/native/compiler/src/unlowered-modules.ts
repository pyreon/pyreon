/**
 * Pyreon modules whose exports have no (or only partial) native lowering, and
 * the per-module advice the "has NO native lowering" warning names.
 *
 * The compiler keeps hand-maintained entries for modules without a plugin
 * (`UNLOWERED_PYREON_MODULES` in `parse.ts`); a plugin supplies its own through
 * `CompilerPlugin.unlowered`, merged here into the compiler instance's
 * registries — a plugin's entry wins over a core entry for the same module.
 */
export interface UnloweredModule {
  /** What to do instead, named per module — a generic refusal leaves the author guessing. */
  readonly advice: string
  /** Exports from this module that DO lower and must stay silent. */
  readonly supported?: ReadonlySet<string> | undefined
  /**
   * Warn ONLY these exports, leaving everything else silent.
   *
   * Required for @pyreon/core and @pyreon/reactivity, where the overwhelming
   * majority of exports lower (`signal`, `computed`, `effect`, `h`, `Fragment`,
   * `Show`, `For`, …) and only a handful do not. Listing what is SUPPORTED
   * there would mean enumerating almost the whole public surface and
   * false-warning on anything missed — the @pyreon/rx over-generalisation at
   * much larger scale, in the two most-used packages in the framework.
   */
  readonly unsupported?: ReadonlySet<string>
  /**
   * Exports the emitters DROP with their own named warning at the use site
   * (a web-only component). The blanket "reproduced verbatim … the native build
   * fails" line would be false for them, so it is skipped.
   */
  readonly dropped?: ReadonlySet<string> | undefined
}

/** What a plugin supplies per module (`CompilerPlugin.unlowered`); plain data, so it survives a JSON round trip. */
export interface UnloweredSpec {
  readonly advice: string
  /** Exports that DO lower and must stay silent. */
  readonly supported?: readonly string[] | undefined
  /** Exports the emitters drop with their own named warning (so the blanket "verbatim" line is skipped for them). */
  readonly dropped?: readonly string[] | undefined
}

export interface RegisteredUnlowered extends UnloweredModule {
  /** The plugin that supplied it. */
  readonly owner: string
}

type UnloweredPlugin = {
  readonly name: string
  readonly unlowered?: Readonly<Record<string, UnloweredSpec>> | undefined
}

/**
 * Module → entry, from every plugin's `unlowered`. A module supplied by two
 * plugins is a load-time error naming both (which advice wins would depend on
 * plugin order).
 */
export function createUnloweredRegistry(
  plugins: readonly UnloweredPlugin[],
): ReadonlyMap<string, RegisteredUnlowered> {
  const out = new Map<string, RegisteredUnlowered>()
  for (const plugin of plugins) {
    for (const [module, spec] of Object.entries(plugin.unlowered ?? {})) {
      const existing = out.get(module)
      if (existing !== undefined) {
        throw new Error(
          `[Pyreon] unlowered-module metadata for "${module}" is supplied by both "${existing.owner}" and "${plugin.name}". ` +
            `A module has one set of advice — remove one of the two plugins from this app.`,
        )
      }
      out.set(module, {
        advice: spec.advice,
        ...(spec.supported !== undefined ? { supported: new Set(spec.supported) } : {}),
        ...(spec.dropped !== undefined ? { dropped: new Set(spec.dropped) } : {}),
        owner: plugin.name,
      })
    }
  }
  return out
}
