type AssignToBreakpointKey = (
  breakpoints: string[],
) => (
  valueFn: (breakpoint: string, i: number, bps: string[], result: Record<string, unknown>) => void,
) => Record<string, unknown>

const assignToBreakpointKey: AssignToBreakpointKey = (breakpoints) => (valueFn) => {
  const result: Record<string, unknown> = {}
  breakpoints.forEach((item, i) => {
    result[item] = valueFn(item, i, breakpoints, result)
  })
  return result
}

// Mobile-first positional array → per-breakpoint map. A slot that is
// null/undefined is a GAP: it inherits the PREVIOUS breakpoint's resolved
// value (mobile-first `min-width` cascade), NOT the last array element.
//
// Two shapes this must handle correctly, both via the same forward-fill:
//  - trailing gap (array SHORTER than the breakpoint list): `[12, 14]` on
//    [xs…xl] → xs 12, sm 14, then md/lg/xl inherit 14. The previous slot's
//    resolved value already carries the last element forward.
//  - interior gap (an explicit `null`/`undefined` mid-array): `['red', null,
//    'blue']` → xs red, sm inherits red (the null = "skip this breakpoint"),
//    md blue. styled-system / theme-ui both define null-in-array this way.
//
// The prior `arr[i] ?? arr[arr.length - 1]` filled EVERY gap with the LAST
// element, so `['red', null, 'blue']` turned blue at `sm` instead of `md`
// (one breakpoint too early) and `[a, null, b, null, null]` (last element
// null) dropped interior gaps to `null`. This now matches `handleObjectCb`
// exactly, so arrays and breakpoint-objects share one cascade semantic.
// `0` / `false` are real values (not gaps): the `!= null` guard preserves them.
const handleArrayCb =
  (arr: (string | number | null | undefined)[]) =>
  (_: string, i: number, bps: string[], res: Record<string, unknown>) => {
    const currentValue = arr[i]
    if (currentValue != null) return currentValue
    const prevBp = bps[i - 1]
    return prevBp != null ? res[prevBp] : undefined
  }

const handleObjectCb =
  (obj: Record<string, unknown>) =>
  (bp: string, i: number, bps: string[], res: Record<string, unknown>) => {
    const currentValue = obj[bp]
    const prevBp = bps[i - 1]
    const previousValue = prevBp != null ? res[prevBp] : undefined
    if (currentValue != null) return currentValue
    return previousValue
  }

const handleValueCb = (value: unknown) => () => value

// for-in early-exit avoids the `Object.values(props)` array allocation
// that the prior `.some()` paid on every theme normalization decision.
// Fires once per per-breakpoint theme transform; the early `return true`
// is hit by any responsive token, so most calls bail out quickly. Ported
// from vitus-labs `e573e6c4`; measured upstream: +20.3%.
const shouldNormalize = (props: Record<string, any>) => {
  for (const key in props) {
    const item = props[key]
    if (typeof item === 'object' || Array.isArray(item)) return true
  }
  return false
}

export type NormalizeTheme = ({
  theme,
  breakpoints,
}: {
  theme: Record<string, unknown>
  breakpoints: string[]
}) => Record<string, unknown>

const normalizeTheme: NormalizeTheme = ({ theme, breakpoints }) => {
  if (!shouldNormalize(theme)) return theme

  const getBpValues = assignToBreakpointKey(breakpoints)
  const result: Record<string, unknown> = {}

  // for-in instead of Object.entries.forEach — avoids the entries-tuple
  // array allocation per theme normalization (one outer alloc + one inner
  // [k,v] tuple per property dropped). Ported from vitus-labs `e573e6c4`.
  for (const key in theme) {
    const value = theme[key]
    if (value == null) continue

    if (Array.isArray(value)) {
      result[key] = getBpValues(handleArrayCb(value as (string | number | null | undefined)[]))
    } else if (typeof value === 'object') {
      result[key] = getBpValues(handleObjectCb(value as Record<string, any>))
    } else {
      result[key] = getBpValues(handleValueCb(value))
    }
  }

  return result
}

export default normalizeTheme
