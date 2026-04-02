import { defaultTheme } from './defaultTheme'
import type { ComponentThemeDef, ModeAwareFn } from './defineComponentTheme'
import { m } from './semantics'
import type { DeepPartial, ThemeConfig } from './types'

// ─── Global UI Config ────────────────────────────────────────────────────────

interface UIConfig {
  theme: ThemeConfig
  components: Record<string, (tokens: ThemeConfig, m: ModeAwareFn) => Record<string, any>>
  defaults: {
    size?: string
    radius?: string
  }
}

let _config: UIConfig = {
  theme: defaultTheme,
  components: {},
  defaults: {},
}

/**
 * Configure the entire UI library. Call once at app init.
 *
 * @example
 * ```ts
 * import { configureUI, createTheme } from '@pyreon/ui-theme'
 * import { violet } from '@pyreon/ui-tokens'
 *
 * configureUI({
 *   theme: createTheme({ colors: { primary: violet } }),
 *   components: {
 *     Button: (t) => ({ base: { borderRadius: t.radii.full } }),
 *   },
 * })
 * ```
 */
export function configureUI(config: Partial<UIConfig>): void {
  if (config.theme) _config.theme = config.theme
  if (config.components) _config.components = { ..._config.components, ...config.components }
  if (config.defaults) _config.defaults = { ..._config.defaults, ...config.defaults }
}

/** Get the current global theme config. */
export function getThemeConfig(): ThemeConfig {
  return _config.theme
}

/** Get the current UI defaults. */
export function getDefaults(): UIConfig['defaults'] {
  return _config.defaults
}

// ─── Component Theme Resolution ──────────────────────────────────────────────

/** Deep merge two plain objects. */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const src = source[key]
    const tgt = target[key]
    if (src && typeof src === 'object' && !Array.isArray(src) && tgt && typeof tgt === 'object' && !Array.isArray(tgt)) {
      result[key] = deepMerge(tgt, src)
    } else if (src !== undefined) {
      result[key] = src
    }
  }
  return result
}

/**
 * Resolve a component's theme by:
 * 1. Running the component's factory with the current global tokens
 * 2. Deep-merging any user overrides from configureUI().components
 *
 * Returns { base, states, sizes, variants, ... } ready for rocketstyle chaining.
 */
export function getComponentTheme<T extends Record<string, any>>(def: ComponentThemeDef<T>): T {
  const tokens = _config.theme
  const base = def.factory(tokens, m)

  const userOverride = _config.components[def.name]
  if (!userOverride) return base

  const override = userOverride(tokens, m)
  return deepMerge(base as Record<string, any>, override) as T
}

/**
 * Reset config to defaults. Useful for testing.
 */
export function resetUIConfig(): void {
  _config = {
    theme: defaultTheme,
    components: {},
    defaults: {},
  }
}
