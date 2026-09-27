import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * An OptionChart's rows are synthesized structs, typed from their first row.
 * A column is written as Doubles whenever any of its values is fractional (or
 * a gap), so the first row's integral `1.0` must type the field Double too —
 * else the rows split into two struct types that cannot share an array, and
 * the most ordinary line chart (`data: [1, 2.5]`) does not compile.
 */
const chart = (data: string): string => `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'line', data: ${data} }] }} />
}`

describe.each(['swift', 'kotlin'] as const)('row doubles on %s', (target) => {
  for (const [name, data] of [['an integral first row, a fractional later one', '[1, 2.5, 3]'], ['a null gap', '[1, null, 3]']] as const) {
    it(`${name}: one row struct, and it compiles`, () => {
      const r = transform(chart(data), { target })
      expect(r.warnings).toEqual([])
      expect(r.code.match(/struct __Obj|data class __Obj/g)?.length).toBe(1)
      if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
      if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
    })
  }
})
