/**
 * `defineAtlasPlugin` — an identity helper that gives plugin authors full type
 * inference on the hook signatures without annotating them by hand. Mirrors the
 * framework's `defineStore` / `defineManifest` ergonomics.
 */
import type { AtlasPlugin } from './types'

export function defineAtlasPlugin(plugin: AtlasPlugin): AtlasPlugin {
  return plugin
}
