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
import { createPluginRegistry } from './plugins'

export * from './core'
export * from './plugins'

export interface AtlasConfig {
  /** the plugins that drive discovery, enrichment, verification, and graph passes */
  plugins?: readonly AtlasPlugin[]
  /** the directory Atlas is pointed at (defaults to the process cwd) */
  cwd?: string
}

export interface Atlas {
  /** run the full pipeline and return the assembled, verified Catalog Graph */
  build(): Promise<CatalogGraph>
}

export function createAtlas(config: AtlasConfig = {}): Atlas {
  const cwd = config.cwd ?? '.'
  const registry = createPluginRegistry(config.plugins ?? [])

  return {
    async build() {
      // 1. discover — every plugin contributes components
      const discovered = await registry.runDiscover({ cwd })

      // 2. decorate + 3. verify — enrich each component, then verify its scenarios
      const enriched: ComponentIntelligence[] = []
      for (const ci of discovered) {
        const decorated = await registry.runDecorate(ci, { cwd })
        const scenarios: Scenario[] = []
        for (const scenario of decorated.scenarios) {
          const verify = await registry.runVerify({ scenario, component: decorated })
          scenarios.push({ ...scenario, verify })
        }
        enriched.push({ ...decorated, scenarios })
      }

      // 4. graph — assemble, then let plugins run a final pass over the whole graph
      const graph = createCatalogGraph(enriched)
      await registry.runGraph({ graph })
      return graph
    },
  }
}
