import { config, isEmpty, merge } from "@pyreon/ui-core"
import type { ThemeModeCallback } from "../types/theme"
import { removeNullableValues } from "./collection"
import { isMultiKey } from "./dimensions"

// --------------------------------------------------------
// Theme Mode Callback
// --------------------------------------------------------
const MODE_CALLBACK_BRAND = Symbol.for("pyreon.themeModeCallback")

/** Creates a mode-switching function that returns the light or dark value based on the active mode. */
export const themeModeCallback: ThemeModeCallback = (light, dark) => {
  const fn = (mode: string) => {
    if (!mode || mode === "light") return light
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
  typeof value === "function" &&
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
  const result = {}

  if (isEmpty(options.dimensions)) return result

  return Object.entries(options.dimensions).reduce(
    (acc, [key, value]) => {
      const [, dimension] = isMultiKey(value as string | Record<string, unknown>)

      const helper = options[key]

      if (Array.isArray(helper) && helper.length > 0) {
        const finalDimensionThemes = getThemeFromChain(helper, theme)

        acc[dimension] = removeNullableValues(finalDimensionThemes)
      }

      return acc
    },
    result as Record<string, any>,
  )
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

export const getTheme: GetTheme = ({ rocketstate, themes, baseTheme, transformKeys, appTheme }) => {
  let finalTheme = { ...baseTheme }
  const deferredTransforms: Array<
    (
      currentTheme: Record<string, any>,
      currentAppTheme: Record<string, any>,
      mode: typeof themeModeCallback,
      cssFn: typeof config.css,
    ) => Record<string, any>
  > = []

  Object.entries(rocketstate).forEach(([key, value]: [string, string | string[]]) => {
    const keyTheme: Record<string, any> = themes[key] ?? {}
    const isTransform = transformKeys?.[key]

    const mergeValue = (item: string) => {
      const val = keyTheme[item]
      if (isTransform && typeof val === "function") {
        deferredTransforms.push(val)
      } else {
        finalTheme = merge({}, finalTheme, val)
      }
    }

    if (Array.isArray(value)) {
      value.forEach(mergeValue)
    } else {
      mergeValue(value)
    }
  })

  // Apply transform dimension values last with the fully accumulated theme
  for (const transform of deferredTransforms) {
    finalTheme = merge(
      {},
      finalTheme,
      transform(finalTheme, appTheme ?? {}, themeModeCallback, config.css),
    )
  }

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
  mode: "light" | "dark",
) => Partial<{
  baseTheme: Record<string, unknown>
  themes: Record<string, unknown>
}>

export const getThemeByMode: GetThemeByMode = (object, mode) =>
  Object.keys(object).reduce(
    (acc, key) => {
      const value = object[key]

      if (typeof value === "object" && value !== null) {
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
