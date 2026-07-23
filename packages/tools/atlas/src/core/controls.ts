/**
 * Pure type → control inference. The `auto` module extracts a component's real
 * TS prop types (via the compiler's prop extractor) and feeds them here as
 * `PropShape[]`; this kernel maps each shape to a UI control descriptor with no
 * dependency on the type checker, so it is fully unit-testable.
 */
import type { PropControl } from './types'

/** A normalized, serializable descriptor of a single prop's TS type. */
export type PropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'accessor'
  | 'color'
  | 'unknown'
  | { readonly union: readonly string[] }

export interface PropShape {
  name: string
  type: PropType
  /** true when the prop is optional (`?:`) — used to derive `required` */
  optional?: boolean
  defaultValue?: unknown
}

/** Prop names that read as colors get a color control even when typed `string`. */
const COLOR_NAME = /(?:^|[-_])(?:colou?r|background|fill|stroke|tint)(?:$|[-_A-Z])/

/** Map one prop shape to its control descriptor. */
export function inferControl(shape: PropShape): PropControl {
  const required = shape.optional !== true && shape.defaultValue === undefined
  const base = { name: shape.name, defaultValue: shape.defaultValue, reactive: false, required }

  if (typeof shape.type === 'object') {
    return { ...base, kind: 'select', options: shape.type.union }
  }
  switch (shape.type) {
    case 'accessor':
      return { ...base, kind: 'reactive', reactive: true }
    case 'number':
      return { ...base, kind: 'number' }
    case 'boolean':
      return { ...base, kind: 'boolean' }
    case 'color':
      return { ...base, kind: 'color' }
    case 'string':
      return { ...base, kind: COLOR_NAME.test(shape.name) ? 'color' : 'text' }
    default:
      return { ...base, kind: 'unknown' }
  }
}

/** Map a whole prop set to controls, preserving declaration order. */
export function inferControls(shapes: readonly PropShape[]): PropControl[] {
  return shapes.map(inferControl)
}
