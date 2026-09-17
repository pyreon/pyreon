// Two result shapes a registered dataset transform can hand back that the
// table builder has to absorb rather than choke on: a list containing a
// NON-object entry, and a data array that mixes object records with array rows.
import { afterEach, describe, expect, it } from 'vitest'
import { applyTransformsAll, registerChartTransform, unregisterChartTransform } from './option-layer'

const registered: string[] = []
const register = (type: string, transform: Parameters<typeof registerChartTransform>[0]['transform']) => {
  registerChartTransform({ type, transform })
  registered.push(type)
}
afterEach(() => {
  for (const t of registered.splice(0)) unregisterChartTransform(t)
})

describe('registered transform result shapes', () => {
  it('a non-object entry in a result LIST becomes an empty table rather than throwing', () => {
    register('t:list-with-junk', () => [{ data: [[1]] }, 7 as never])
    const out = applyTransformsAll({ dims: ['x'], rows: [[0]] }, [{ type: 't:list-with-junk' }], [])
    expect(out).toHaveLength(2)
    expect(out[1]!.rows).toEqual([])
  })

  it('records mixed with ARRAY rows keep the array rows as they are', () => {
    // Deliberately outside the declared result type: a transform written in plain JS can return this.
    register('t:mixed', () => ({ data: [{ a: 1, b: 2 }, [3, 4]] }) as never)
    const [out] = applyTransformsAll({ dims: ['x'], rows: [[0]] }, [{ type: 't:mixed' }], [])
    expect(out!.dims).toEqual(['a', 'b'])
    expect(out!.rows).toEqual([[1, 2], [3, 4]])
  })
})
