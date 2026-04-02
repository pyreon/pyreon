import { defaultTheme } from './defaultTheme'
import { buildSemantics } from './semantics'
import type { DeepPartial, ThemeConfig } from './types'

/** Deep merge two objects. Arrays and primitives are replaced, objects are merged. */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = target[key]

    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal)
    } else if (srcVal !== undefined) {
      result[key] = srcVal
    }
  }

  return result
}

/**
 * Create a custom theme by merging overrides with the default theme.
 *
 * @example
 * ```ts
 * const theme = createTheme({
 *   colors: { primary: violet },
 *   radii: { md: 8 },
 * })
 * ```
 */
export function createTheme(overrides: DeepPartial<ThemeConfig> = {}): ThemeConfig {
  const merged = deepMerge(defaultTheme as Record<string, any>, overrides as Record<string, any>) as ThemeConfig

  // Rebuild semantic colors if color palettes changed
  if (overrides.colors && !overrides.semantic) {
    merged.semantic = buildSemantics(merged.colors.gray, merged.colors.primary)
  }

  return merged
}
