import stripUnit from './stripUnit'

type CssUnits =
  | 'px'
  | 'rem'
  | '%'
  | 'em'
  | 'ex'
  | 'cm'
  | 'mm'
  | 'in'
  | 'pt'
  | 'pc'
  | 'ch'
  | 'vh'
  | 'vw'
  | 'vmin'
  | 'vmax'

const isNotValue = (val: unknown) => !val && val !== 0

export type Value = (
  param: string | number | null | undefined,
  rootSize?: number,
  outputUnit?: CssUnits,
) => string | number | null

const value: Value = (param, rootSize = 16, outputUnit = 'rem'): string | number | null => {
  if (isNotValue(param)) return null

  // After the guard above, param is guaranteed to be string | number (non-null)
  const p = param as string | number

  const [val, unit] = stripUnit(p as string, true)
  if (isNotValue(val)) return null
  if (val === 0 || typeof val === 'string') return p

  const canConvert = rootSize && !Number.isNaN(val)
  if (canConvert && !unit && outputUnit === 'px') return `${val}${outputUnit}`
  if (canConvert && !unit) return `${val / rootSize}rem`
  if (canConvert && unit === 'px' && outputUnit === 'rem') return `${val / rootSize}rem`
  if (unit) return p

  return `${val}${outputUnit}`
}

export default value
