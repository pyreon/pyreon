/**
 * `@pyreon/atlas/plugins` — the plugin API + the built-in plugins. Every Atlas
 * capability is a plugin on this contract (discover → decorate → verify →
 * graph), so the extension surface is first-class rather than bolted on.
 *
 * Built-in suite:
 *   - scenario generation: variantMatrix, states, edgeCases, theme, defaultScenario
 *   - enrichment:          tags, fillDefaults
 *   - verification:        a11y (static)
 *   - docs:                usageDocs
 *   - bundle:              recommendedPlugins (the great defaults, ordered)
 */
export type {
  AtlasPlugin,
  DiscoverContext,
  DecorateContext,
  VerifyContext,
  GraphContext,
  PanelDescriptor,
} from './types'

export { defineAtlasPlugin } from './define'

export type { PluginRegistry } from './registry'
export { createPluginRegistry, emptyVerdict } from './registry'

// scenario generation
export type { VariantMatrixOptions } from './variant-matrix'
export { variantMatrixPlugin } from './variant-matrix'
export type { StatesOptions, EdgeCaseOptions, ThemeOptions } from './scenarios'
export { defaultScenarioPlugin, statesPlugin, edgeCasesPlugin, themePlugin } from './scenarios'

// enrichment
export { fillDefaultsPlugin } from './fill-defaults'
export { tagsPlugin } from './tags'

// verification
export { a11yPlugin } from './a11y'

// docs
export { usageDocsPlugin } from './usage-docs'

// AI assets
export type { AgentAsset, AiAssetsOptions } from './ai-assets'
export { aiAssetsPlugin } from './ai-assets'

// curated bundle
export type { RecommendedOptions } from './recommended'
export { recommendedPlugins } from './recommended'
