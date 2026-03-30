/**
 * Default dimension configuration for rocketstyle components.
 * Defines four built-in dimensions: `states`, `sizes`, `variants`,
 * and `multiple` (a multi-select dimension).
 */
const DEFAULT_DIMENSIONS = {
  states: 'state',
  sizes: 'size',
  variants: 'variant',
  multiple: {
    propName: 'multiple',
    multi: true,
  },
  modifiers: {
    propName: 'modifier',
    multi: true,
    transform: true,
  },
} as const

export type DefaultDimensions = typeof DEFAULT_DIMENSIONS

export default DEFAULT_DIMENSIONS
