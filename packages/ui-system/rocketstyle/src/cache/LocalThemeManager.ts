/**
 * WeakMap-based multi-tier cache for computed theme objects.
 * Maintains separate caches for base themes, dimension themes,
 * and their light/dark mode variants to avoid recalculation on re-renders.
 */
export default class ThemeManager {
  baseTheme = new WeakMap()

  dimensionsThemes = new WeakMap()

  modeBaseTheme = { light: new WeakMap(), dark: new WeakMap() }

  modeDimensionTheme = { light: new WeakMap(), dark: new WeakMap() }
}
