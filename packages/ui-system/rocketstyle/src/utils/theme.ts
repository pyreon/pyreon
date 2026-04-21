import { config, isEmpty, merge } from '@pyreon/ui-core'
import type { ThemeModeCallback } from '../types/theme'
import { removeNullableValues } from './collection'
import { isMultiKey } from './dimensions'

// --------------------------------------------------------
// Theme Mode Callback
// --------------------------------------------------------
const MODE_CALLBACK_BRAND = Symbol.for('pyreon.themeModeCallback')

/** Creates a mode-switching function that returns the light or dark value based on the active mode. */
export const themeModeCallback: ThemeModeCallback = (light, dark) => {
  const fn = (mode: string) => {
    if (!mode || mode === 'light') return light
    return dark
  }
  ;(fn as unknown as Record<string, unknown>).__brand = MODE_CALLBACK_BRAND
  return fn
}

// --------------------------------------------------------
// Theme Mode Callback Check
// --------------------------------------------------------
/** Detects whether a value is a `themeModeCallback` function via Symbol brand. */
type IsModeCallback = (value: unknown) => boolean
const isModeCallback: IsModeCallback = (value: unknown) =>
  typeof value === 'function' &&
  (value as unknown as Record<string, unknown>).__brand === MODE_CALLBACK_BRAND

// --------------------------------------------------------
// Get Theme From Chain
// --------------------------------------------------------
/** Reduces an array of chained `.theme()` callbacks into a single merged theme object. */
type OptionFunc = (...arg: any) => Record<string, unknown>
type GetThemeFromChain = (
  options: OptionFunc[] | undefined | null,
  theme: Record<string, any>,
) => ReturnType<OptionFunc>

export const getThemeFromChain: GetThemeFromChain = (options, theme) => {
  const result = {}
  if (!options || isEmpty(options)) return result

  return options.reduce(
    (acc, item) => merge(acc, item(theme, themeModeCallback, config.css)),
    result,
  )
}

// --------------------------------------------------------
// calculate dimension themes
// --------------------------------------------------------
/**
 * Computes the theme object for each dimension by evaluating its
 * chained callbacks against the global theme, then strips nullable values.
 */
type GetDimensionThemes = (
  theme: Record<string, any>,
  options: Record<string, any>,
) => Record<string, any>

export const getDimensionThemes: GetDimensionThemes = (theme, options) => {
  const dims = options.dimensions
  if (isEmpty(dims)) return {}

  const result: Record<string, any> = {}

  for (const key in dims) {
    const [, dimension] = isMultiKey(dims[key] as string | Record<string, unknown>)
    const helper = options[key]

    if (Array.isArray(helper) && helper.length > 0) {
      result[dimension] = removeNullableValues(getThemeFromChain(helper, theme))
    }
  }

  return result
}

// --------------------------------------------------------
// combine values
// --------------------------------------------------------
/** Reduces an array of option callbacks by calling each with the given args and deep-merging results. */
type CalculateChainOptions = (
  options: OptionFunc[] | undefined | null,
  args: any[],
) => Record<string, any>

export const calculateChainOptions: CalculateChainOptions = (options, args) => {
  const result = {}
  if (!options || isEmpty(options)) return result

  return options.reduce((acc, item) => merge(acc, item(...args)), result)
}

// --------------------------------------------------------
// generate theme
// --------------------------------------------------------
/**
 * Generates the final theme object by starting with the base theme
 * and merging in dimension-specific theme slices based on the current
 * rocketstate (active dimension values). Supports multi-key dimensions.
 *
 * Transform dimensions (marked with `transform: true`) are evaluated last.
 * Their values are functions that receive the fully accumulated theme and
 * return overrides — enabling derived styles like "outlined" or "inversed".
 */
export type GetTheme = (params: {
  rocketstate: Record<string, string | string[]>
  themes: Record<string, Record<string, any>>
  baseTheme: Record<string, any>
  transformKeys?: Partial<Record<string, true>>
  /** App theme from context — passed to transform dimension callbacks. */
  appTheme?: Record<string, any>
}) => Record<string, unknown>

// Shared empty object for pseudo-state defaults — allocated once, reused by
// every getTheme call. Frozen to prevent accidental mutation.
const EMPTY_PSEUDO: Record<string, never> = Object.freeze({}) as Record<string, never>

export const getTheme: GetTheme = ({ rocketstate, themes, baseTheme, transformKeys, appTheme }) => {
  // Spread baseTheme into result — this is unavoidable (we must not mutate
  // the cached baseTheme). But we merge dimension slices in-place onto
  // finalTheme instead of creating a new {} target each merge() call.
  const finalTheme: Record<string, any> = { ...baseTheme }
  type TransformFn = (
    currentTheme: Record<string, any>,
    currentAppTheme: Record<string, any>,
    mode: typeof themeModeCallback,
    cssFn: typeof config.css,
  ) => Record<string, any>
  const deferredTransforms: TransformFn[] = []

  for (const key in rocketstate) {
    const value = rocketstate[key]
    if (value == null) continue
    const keyTheme: Record<string, any> = themes[key] ?? {}
    const isTransform = transformKeys?.[key]

    const mergeValue = (item: string) => {
      const val = keyTheme[item]
      if (val == null) return
      if (isTransform && typeof val === 'function') {
        deferredTransforms.push(val as TransformFn)
      } else {
        // Merge in-place onto finalTheme — avoids allocating a fresh {}
        // as merge target on every dimension slice.
        merge(finalTheme, val)
      }
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) mergeValue(value[i] as string)
    } else {
      mergeValue(value as string)
    }
  }

  // Apply transform dimension values last with the fully accumulated theme
  for (let i = 0; i < deferredTransforms.length; i++) {
    merge(finalTheme, deferredTransforms[i]!(finalTheme, appTheme ?? {}, themeModeCallback, config.css))
  }

  // Ensure pseudo-state keys always exist as objects so .styles() can
  // destructure without defaults: const { hover, focus, ... } = $rocketstyle
  // Uses a frozen shared empty object instead of allocating 6 new {} per call.
  finalTheme.hover ??= EMPTY_PSEUDO
  finalTheme.focus ??= EMPTY_PSEUDO
  finalTheme.active ??= EMPTY_PSEUDO
  finalTheme.disabled ??= EMPTY_PSEUDO
  finalTheme.pressed ??= EMPTY_PSEUDO
  finalTheme.readOnly ??= EMPTY_PSEUDO

  return finalTheme
}

// --------------------------------------------------------
// resolve theme by mode
// --------------------------------------------------------
/**
 * Recursively traverses a theme object and resolves any `themeModeCallback`
 * functions to their concrete light or dark values for the given mode.
 */
export type GetThemeByMode = (
  object: Record<string, any>,
  mode: 'light' | 'dark',
) => Partial<{
  baseTheme: Record<string, unknown>
  themes: Record<string, unknown>
}>

export const getThemeByMode: GetThemeByMode = (object, mode) =>
  Object.keys(object).reduce(
    (acc, key) => {
      const value = object[key]

      if (typeof value === 'object' && value !== null) {
        acc[key] = getThemeByMode(value, mode)
      } else if (isModeCallback(value)) {
        acc[key] = value(mode)
      } else {
        acc[key] = value
      }

      return acc
    },
    {} as Record<string, any>,
  )
