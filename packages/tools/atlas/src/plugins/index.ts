/**
 * `@pyreon/atlas/plugins` — the plugin API + the built-in plugins. Every Atlas
 * capability is a plugin on this contract (discover → decorate → verify →
 * graph), so the extension surface is first-class rather than bolted on.
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

export type { VariantMatrixOptions } from './variant-matrix'
export { variantMatrixPlugin } from './variant-matrix'

export { a11yPlugin } from './a11y'
