import { get, isEmpty, set } from '@pyreon/ui-core'
import type { Dimensions, DimensionValue, MultiKeys } from '../types/dimensions'

// --------------------------------------------------------
// Is value a valid key
// --------------------------------------------------------
/** Checks whether a dimension value is defined and not explicitly disabled (false). */
type IsValidKey = (value: any) => boolean
export const isValidKey: IsValidKey = (value) =>
  value !== undefined && value !== null && value !== false

// --------------------------------------------------------
// Is value a multi key
// --------------------------------------------------------
/** Determines if a dimension value is a multi-key config object, returning [isMulti, propName]. */
type IsMultiKey = (value: string | Record<string, unknown>) => [boolean, string]
export const isMultiKey: IsMultiKey = (value) => {
  if (typeof value === 'object' && value !== null) return [true, get(value, 'propName') as string]
  return [false, value]
}

// --------------------------------------------------------
// calculate dimensions map
// --------------------------------------------------------
/**
 * Builds a two-level map (`keysMap`) of dimension -> option -> true,
 * and a flat `keywords` lookup of all prop names reserved by dimensions
 * (including boolean shorthand keys when `useBooleans` is enabled).
 */
type GetDimensionsMap = <T extends Record<string, any>>({
  themes,
  useBooleans,
}: {
  themes: T
  useBooleans?: boolean
}) => { keysMap: Record<string, any>; keywords: Record<string, any> }

export const getDimensionsMap: GetDimensionsMap = ({ themes, useBooleans }) => {
  const result = {
    keysMap: {} as Record<string, any>,
    keywords: {} as Record<string, any>,
  }

  if (isEmpty(themes)) return result

  return Object.entries(themes).reduce((accumulator, [key, value]) => {
    const { keysMap, keywords } = accumulator
    keywords[key] = true

    Object.entries(value).forEach(([itemKey, itemValue]) => {
      if (!isValidKey(itemValue)) return

      if (useBooleans) {
        keywords[itemKey] = true
      }

      set(keysMap, [key, itemKey], true)
    })

    return accumulator
  }, result)
}

// --------------------------------------------------------
// simple object getters
// --------------------------------------------------------
/** Returns the keys of an object with proper typing. */
type GetKeys = <T extends Record<string, unknown>>(obj: T) => Array<keyof T>
export const getKeys: GetKeys = (obj) => Object.keys(obj)

type GetValues = <T extends Record<string, unknown>, K extends keyof T>(obj: T) => T[K][]
export const getValues = (<T extends Record<string, unknown>>(obj: T) =>
  Object.values(obj)) as GetValues

// --------------------------------------------------------
// get dimensions values array
// --------------------------------------------------------
/** Extracts the prop name from each dimension value, unwrapping multi-key config objects. */
type ValueType<T> = T extends string ? T : T[][0]
type GetDimensionsValues = <T extends Dimensions, K extends keyof T>(obj: T) => ValueType<T[K]>[]

export const getDimensionsValues = (<T extends Dimensions>(obj: T) =>
  getValues(obj).map((item: DimensionValue) => {
    if (typeof item === 'object') {
      return item.propName as string
    }

    return item
  })) as GetDimensionsValues

// --------------------------------------------------------
// get multiple dimensions map
// --------------------------------------------------------
/** Builds a lookup of dimension prop names that accept multiple simultaneous values. */
type GetMultipleDimensions = <T extends Dimensions>(obj: T) => MultiKeys<T>

export const getMultipleDimensions: GetMultipleDimensions = (obj) =>
  getValues(obj).reduce(
    (accumulator, value: DimensionValue) => {
      if (typeof value === 'object') {
        if (value.multi === true) accumulator[value.propName] = true
      }

      return accumulator
    },
    {} as Record<string, true>,
  )

// --------------------------------------------------------
// get transform dimensions map
// --------------------------------------------------------
/** Builds a lookup of dimension prop names that are transform dimensions (evaluated last with function values). */
type TransformKeys = Partial<Record<string, true>>
type GetTransformDimensions = <T extends Dimensions>(obj: T) => TransformKeys

export const getTransformDimensions: GetTransformDimensions = (obj) =>
  getValues(obj).reduce(
    (accumulator, value: DimensionValue) => {
      if (typeof value === 'object') {
        if (value.transform === true) accumulator[value.propName] = true
      }

      return accumulator
    },
    {} as Record<string, true>,
  )
