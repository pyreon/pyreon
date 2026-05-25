import value from './value'

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

type GetValueOf = (...args: unknown[]) => number | string
// Impl args tightened from `any[]` to `unknown[]` to match the declared
// `GetValueOf`. `find` returns `unknown` after the filter; cast to the
// declared return shape — the runtime contract is "first non-undefined,
// non-null value", which callers (`values`) handle for any concrete shape.
const getValueOf: GetValueOf = (...args: unknown[]) =>
  args.find((v) => typeof v !== 'undefined' && v !== null) as number | string

export type Values = (
  items: unknown[],
  rootSize?: number,
  outputUnit?: CssUnits,
) => string | number | null

const values: Values = (items, rootSize, outputUnit) => {
  const param = getValueOf(...items)

  if (Array.isArray(param)) {
    return param.map((item) => value(item, rootSize, outputUnit)).join(' ')
  }

  return value(param, rootSize, outputUnit)
}

export default values
