// `planDateTime` / `planNumber` options outside the arms `intl-lowering.test.ts` checks: the hour-cycle letters, a
// non-string time zone, a non-boolean hour12, `useGrouping` keyword forms, an invalid currency, narrowSymbol, and the
// combinations JavaScript rejects. Each mirrors what V8 does with the same options: lowered, ignored-and-named, or
// refused with nothing to lower.

import { describe, expect, it } from 'vitest'
import { planDateTime, planNumber, type IntlOptionInput } from '../intl-options'

const opts = (o: Record<string, string | number | boolean>): Map<string, IntlOptionInput> =>
  new Map(Object.entries(o).map(([k, v]) => [k, { kind: 'static', value: v }]))
const dyn = (key: string): Map<string, IntlOptionInput> => new Map([[key, { kind: 'dynamic', index: 0 }]])

const skeleton = (o: Record<string, string | number | boolean>): string | undefined => {
  const r = planDateTime('DateTimeFormat', opts(o))
  return r.plan?.kind === 'datetime' ? r.plan.skeleton : undefined
}

describe('planDateTime residual options', () => {
  it('every hourCycle picks its own hour letter', () => {
    expect(skeleton({ hour: 'numeric', hourCycle: 'h11' })).toBe('K')
    expect(skeleton({ hour: '2-digit', hourCycle: 'h12' })).toBe('hh')
    expect(skeleton({ hour: 'numeric', hourCycle: 'h24' })).toBe('k')
    expect(skeleton({ hour: 'numeric', hour12: false })).toBe('H')
  })

  it('a non-string timeZone and a non-boolean hour12 are named and ignored', () => {
    const tz = planDateTime('DateTimeFormat', opts({ timeZone: 5 }))
    expect(tz.warnings.join()).toContain('`timeZone` must be an IANA zone name string')
    expect(tz.plan).not.toBeNull()
    const h = planDateTime('DateTimeFormat', dyn('hour12'))
    expect(h.warnings.join()).toContain('`hour12` must be a boolean literal')
  })

  it('a runtime timeZone is carried as a dynamic option', () => {
    const r = planDateTime('DateTimeFormat', dyn('timeZone'))
    expect(r.plan?.kind === 'datetime' ? r.plan.timeZone : undefined).toEqual({ kind: 'dynamic', index: 0 })
  })

  it('hourCycle without hour is named as having no effect', () => {
    expect(planDateTime('DateTimeFormat', opts({ year: 'numeric', hourCycle: 'h23' })).warnings.join()).toContain('`hourCycle` without `hour` has no effect')
  })

  it('an option DateTimeFormat does not have is named', () => {
    expect(planDateTime('DateTimeFormat', opts({ bogus: 'x' })).warnings.join()).toContain('`bogus` is not a DateTimeFormat option')
  })
})

describe('planNumber residual options', () => {
  const where = '`Intl.NumberFormat`'

  it('useGrouping accepts "always" and "auto" as true, and names anything else', () => {
    for (const v of ['always', 'auto']) {
      const r = planNumber(where, opts({ useGrouping: v }))
      expect(r.warnings, v).toEqual([])
      expect(r.plan?.kind === 'number' ? r.plan.useGrouping : undefined, v).toBe(true)
    }
    expect(planNumber(where, opts({ useGrouping: 'min2' })).warnings.join()).toContain('`useGrouping` must be')
  })

  it('an invalid currency code is named; a lower-case code is upper-cased; a runtime one is carried', () => {
    expect(planNumber(where, opts({ style: 'currency', currency: 'dollars' })).warnings.join()).toContain('must be an ISO 4217 code')
    const lower = planNumber(where, opts({ style: 'currency', currency: 'eur' }))
    expect(lower.plan?.kind === 'number' ? lower.plan.currency : undefined).toEqual({ kind: 'static', value: 'EUR' })
    const runtime = planNumber(where, new Map<string, IntlOptionInput>([['style', { kind: 'static', value: 'currency' }], ['currency', { kind: 'dynamic', index: 0 }]]))
    expect(runtime.plan?.kind === 'number' ? runtime.plan.currency : undefined).toEqual({ kind: 'dynamic', index: 0 })
  })

  it('narrowSymbol falls back to the regular symbol, named', () => {
    const r = planNumber(where, opts({ style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }))
    expect(r.warnings.join()).toContain('`currencyDisplay: "narrowSymbol"` has no native formatter equivalent')
    expect(r.plan?.kind === 'number' ? r.plan.currencyDisplay : undefined).toBe('symbol')
  })

  it('currency outside the currency style is ignored, as in JavaScript', () => {
    const r = planNumber(where, opts({ currency: 'USD', currencyDisplay: 'code' }))
    expect(r.warnings.join()).toContain('only apply with `style: "currency"`')
    expect(r.plan?.kind === 'number' ? r.plan.currency : 'x').toBeUndefined()
  })

  it('min > max fraction digits is a RangeError in JavaScript: nothing to lower', () => {
    const r = planNumber(where, opts({ minimumFractionDigits: 3, maximumFractionDigits: 1 }))
    expect(r.plan).toBeNull()
    expect(r.warnings.join()).toContain('`minimumFractionDigits` is greater than `maximumFractionDigits`')
  })

  it('out-of-range and non-integer digit counts are named; a runtime digit count is carried', () => {
    expect(planNumber(where, opts({ minimumIntegerDigits: 0 })).warnings.join()).toContain('`minimumIntegerDigits: 0` is out of range')
    expect(planNumber(where, opts({ maximumFractionDigits: 1.5 })).warnings.join()).toContain('`maximumFractionDigits: 1.5` is out of range')
    const r = planNumber(where, dyn('minimumFractionDigits'))
    expect(r.warnings).toEqual([])
  })

  it('an option NumberFormat does not have is named', () => {
    expect(planNumber(where, opts({ bogus: 1 })).warnings.join()).toContain('`bogus` is not a NumberFormat option')
  })
})
