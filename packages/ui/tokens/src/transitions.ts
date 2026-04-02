/** Transition duration tokens in ms. */
export const duration = {
  fast: 150,
  normal: 200,
  slow: 300,
} as const

/** Easing function tokens. */
export const easing = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/** Pre-composed transition shorthand tokens. */
export const transition = {
  fast: `${duration.fast}ms ${easing.default}`,
  normal: `${duration.normal}ms ${easing.default}`,
  slow: `${duration.slow}ms ${easing.default}`,
} as const

export type DurationKey = keyof typeof duration
export type EasingKey = keyof typeof easing
