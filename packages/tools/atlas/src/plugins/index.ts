/**
 * `@pyreon/atlas/plugins` — the plugin API + the built-in plugins. Every Atlas
 * capability is a plugin on this contract (discover → decorate → verify →
 * graph), so the extension surface is first-class rather than bolted on.
 *
 * Built-in suite:
 *   - scenario generation: variantMatrix, states, edgeCases, theme, defaultScenario
 *   - enrichment:          tags, fillDefaults
 *   - verification:        a11y (static), mount (runtime)
 *   - docs:                usageDocs
 *   - bundle:              recommendedPlugins (the great defaults, ordered)
 *
 * The canvas addons (viewport / backgrounds / pseudo-states / outline) are NOT
 * plugins — they are a UI concern and live in `../ui/addons`. This module runs
 * under `atlas scan` in Node; nothing here touches a DOM at import time. The
 * mount plugin acquires one lazily, only when a scenario is actually verified,
 * and skips with a reason when it cannot.
 */
export type {
  AtlasPlugin,
  DiscoverContext,
  DecorateContext,
  VerifyContext,
  GraphContext,
} from './types'

export { defineAtlasPlugin } from './define'

export type { PluginRegistry } from './registry'
export { createPluginRegistry, emptyVerdict } from './registry'

// scenario generation
export type { VariantMatrixOptions } from './variant-matrix'
export { variantMatrixPlugin } from './variant-matrix'
export type { StatesOptions, EdgeCaseOptions, ThemeOptions } from './scenarios'
export { authoredScenariosPlugin,
  defaultScenarioPlugin, statesPlugin, edgeCasesPlugin, themePlugin } from './scenarios'

// enrichment
export { fillDefaultsPlugin } from './fill-defaults'
export { tagsPlugin } from './tags'

// verification
export { a11yPlugin } from './a11y'
export { mountPlugin, type MountPluginOptions, releaseVerifyDom } from './mount'

// docs
export { usageDocsPlugin } from './usage-docs'

// AI assets
export type { AgentAsset, AiAssetsOptions } from './ai-assets'
export { aiAssetsPlugin } from './ai-assets'

// curated bundle
export type { RecommendedOptions } from './recommended'
export { recommendedPlugins } from './recommended'
