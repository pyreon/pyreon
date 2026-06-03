import { isEmpty, set } from '@pyreon/ui-core'

const removeUnexpectedKeys = (obj: Record<string, unknown>, keys: string[]) => {
  const result: Record<string, unknown> = {}
  keys.forEach((bp) => {
    const value = obj[bp]
    if (value) {
      result[bp] = value
    }
  })
  return result
}

export type TransformTheme = ({
  theme,
  breakpoints,
}: {
  theme: Record<string, unknown>
  breakpoints: string[]
}) => any

const transformTheme: TransformTheme = ({ theme, breakpoints }) => {
  const result = {}

  if (isEmpty(theme) || isEmpty(breakpoints)) return result

  // for-in + nested for-in avoids the two `Object.entries(...)` array
  // allocations (outer + inner per object value) the prior forEach paid.
  // Same for `value.forEach((child, i) => ...)` → indexed for-loop.
  // Ported from vitus-labs `e573e6c4`.
  for (const key in theme) {
    const value = theme[key]
    if (Array.isArray(value) && value.length > 0) {
      for (let i = 0; i < value.length; i++) {
        const indexBreakpoint = breakpoints[i]
        /* v8 ignore next — defensive null guard; i is bounded by value.length */
        if (indexBreakpoint == null) continue
        set(result, [indexBreakpoint, key], value[i])
      }
    } else if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      for (const childKey in obj) {
        set(result, [childKey, key], obj[childKey])
      }
    } else if (value != null) {
      const firstBreakpoint = breakpoints[0]
      /* v8 ignore next — defensive null guard; breakpoints array always populated */
      if (firstBreakpoint == null) continue
      set(result, [firstBreakpoint, key], value)
    }
  }

  return removeUnexpectedKeys(result, breakpoints)
}

export default transformTheme
