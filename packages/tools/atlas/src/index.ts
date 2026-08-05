/**
 * `@pyreon/atlas` — an AI-native component workbench for the Pyreon ecosystem.
 *
 * Atlas inverts Storybook's authoring-first model: the components + their types
 * are the source of truth, and Atlas *derives* a verified, machine-readable
 * catalog (the "Catalog Graph"). This entry wires the plugin-driven pipeline —
 * `discover → decorate → verify → graph` — into a single `createAtlas` factory.
 *
 * Subpath entries keep the layers cleanly separable:
 *   - `@pyreon/atlas/core`    — the framework-agnostic domain model + engine
 *   - `@pyreon/atlas/plugins` — the plugin API + built-in plugins
 */
import type { CatalogGraph, ComponentIntelligence, Scenario } from './core'
import type { AtlasPlugin } from './plugins'
import { createCatalogGraph } from './core'
import { createPluginRegistry, recommendedPlugins } from './plugins'

// NO singleton sentinel here, DELIBERATELY (the lint/mcp/cli tool-package
// precedent, with a structural reason on top): `atlas scan` mounts the
// scanned project's own modules through a Vite loader, and a scanned file
// that imports `@pyreon/atlas` (a hand catalog, a play script's types) loads
// a SECOND in-heap copy of this entry by design — the runner holds `lib/`,
// the loader resolves `src/`. A fail-loud `registerSingleton` would kill
// every scan of every project that imports atlas — proven by the scan-mount
// subprocess test hanging the moment the sentinel was added.

export * from './core'
export * from './plugins'

export interface AtlasConfig {
  /** your discovery + custom plugins (the recommended bundle is applied after them) */
  plugins?: readonly AtlasPlugin[]
  /**
   * Which built-in bundle to apply after your plugins:
   * - `'recommended'` (default) — tags, variant matrix, states, edge cases,
   *   default scenario, fill-defaults, a11y, usage docs.
   * - `'none'` — apply only the plugins you passed.
   */
  preset?: 'recommended' | 'none'
  /** base args merged into generated variant scenarios */
  baseArgs?: Record<string, unknown>
  /** the directory Atlas is pointed at (defaults to the process cwd) */
  cwd?: string
}

/** Identity helper for a typed Atlas config (config-file ergonomics). */
export function defineAtlas(config: AtlasConfig): AtlasConfig {
  return config
}

export interface Atlas {
  /** run the full pipeline and return the assembled, verified Catalog Graph */
  build(): Promise<CatalogGraph>
}

export function createAtlas(config: AtlasConfig = {}): Atlas {
  const cwd = config.cwd ?? '.'
  const bundle =
    config.preset === 'none'
      ? []
      : recommendedPlugins(config.baseArgs ? { baseArgs: config.baseArgs } : {})
  const registry = createPluginRegistry([...(config.plugins ?? []), ...bundle])

  return {
    async build() {
      // 1. discover — every plugin contributes components
      const discovered = await registry.runDiscover({ cwd })

      // 2. decorate — EVERY component, before anything is verified.
      //
      // Decorating and verifying one component at a time would be the obvious
      // loop, and it structurally prevents the most valuable optimization a
      // verify plugin can make: answering for many components at once. The
      // mount plugin's leak check costs a forced garbage collection, and one
      // collection can answer for the whole catalog exactly as well as for one
      // component — but only if the plugin can see the whole catalog when its
      // first scenario is verified.
      //
      // Nothing else changes: decoration has never depended on another
      // component's verdict, so the two phases are independent.
      const decorated: ComponentIntelligence[] = []
      for (const ci of discovered) decorated.push(await registry.runDecorate(ci, { cwd }))

      // 3. verify — each scenario, with the whole decorated set in context.
      const enriched: ComponentIntelligence[] = []
      for (const component of decorated) {
        const scenarios: Scenario[] = []
        for (const scenario of component.scenarios) {
          const verify = await registry.runVerify({ scenario, component, components: decorated })
          scenarios.push({ ...scenario, verify })
        }
        enriched.push({ ...component, scenarios })
      }

      // 4. graph — assemble, then let plugins run a final pass over the whole graph
      const graph = createCatalogGraph(enriched)
      await registry.runGraph({ graph })
      return graph
    },
  }
}
