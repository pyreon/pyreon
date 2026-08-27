type Value<V> = V extends string ? number : V
type Unit<V> = V extends string ? string : undefined

export type StripUnit = <V extends string | number, UR extends boolean = false>(
  value: V,
  unitReturn?: UR,
) => UR extends true ? [Value<V>, Unit<V>] : Value<V>

// Module-level so the literal isn't re-allocated on every `stripUnit` call.
// `value()` funnels every numeric/shorthand descriptor through here (render ×
// breakpoint × property × side — the most-executed leaf in the responsive
// engine), so a fresh `RegExp` per call was thousands of throwaway objects per
// page render. Regex literals carry no `g`/`y` flag → no `lastIndex` state, so
// a shared instance is safe under `.match`.
const CSS_UNIT_RE = /^([+-]?(?:\d+|\d*\.\d+))([a-z]*|%)$/

const stripUnit = ((value: string | number, unitReturn?: boolean) => {
  if (typeof value !== 'string') return unitReturn ? [value, undefined] : value

  const matchedValue = value.match(CSS_UNIT_RE)

  if (unitReturn) {
    if (matchedValue) return [parseFloat(value), matchedValue[2]]
    return [value, undefined]
  }

  if (matchedValue) return parseFloat(value)
  return value
}) as StripUnit

export default stripUnit
