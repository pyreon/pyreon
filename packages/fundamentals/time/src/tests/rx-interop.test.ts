import { signal } from '@pyreon/reactivity'
import { groupBy, map, sortBy } from '@pyreon/rx'
import { by, endOf, pipe, startOf, toPlainDate } from '../fp'
import type { PlainDate } from '../core'

describe('adjusters are plain unary functions, so @pyreon/rx accepts them (no dependency either way)', () => {
  const dates = ['2026-02-10', '2026-01-05', '2026-02-20', '2026-03-01', '2026-01-31'] as PlainDate[]
  const month = startOf('month')

  it('groupBy, map and sortBy with a plain array', () => {
    expect(groupBy(dates, month)).toEqual({
      '2026-01-01': ['2026-01-05', '2026-01-31'],
      '2026-02-01': ['2026-02-10', '2026-02-20'],
      '2026-03-01': ['2026-03-01'],
    })
    // rx's `map` also passes the index; an adjuster ignores it.
    expect(map(dates, endOf('month'))).toEqual(['2026-02-28', '2026-01-31', '2026-02-28', '2026-03-31', '2026-01-31'])
    expect(sortBy(dates, (d) => d)).toEqual([...dates].sort())
    expect([...dates].sort(by((d: PlainDate) => month(d)))[0]).toBe('2026-01-05')
  })

  it('groupBy and map with a signal source re-derive when it changes', () => {
    const source = signal<PlainDate[]>(dates.slice(0, 2))
    const grouped = groupBy(source, month)
    const ends = map(source, pipe(startOf('month'), endOf('month')))

    expect(Object.keys(grouped())).toEqual(['2026-02-01', '2026-01-01'])
    expect(ends()).toEqual(['2026-02-28', '2026-01-31'])
    source.set(dates)
    expect(Object.keys(grouped()).sort()).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(ends()).toHaveLength(5)
  })

  it('buckets instants by local day in a zone', () => {
    const instants = [Date.UTC(2026, 10, 18, 22, 30), Date.UTC(2026, 10, 18, 23, 30), Date.UTC(2026, 10, 19, 5, 0)]

    expect(groupBy(instants, toPlainDate('Europe/Prague'))).toEqual({
      '2026-11-18': [instants[0]],
      '2026-11-19': [instants[1], instants[2]],
    })
  })
})
