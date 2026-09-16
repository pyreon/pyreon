// `setOption` merge semantics: ECharts matches components by id, then by
// name, then positionally, and `replaceMerge` drops whatever the update does
// not name. The identity rules are what decide whether a re-render REUSES a
// component or replaces it, so an unasserted arm silently changes what
// survives an update.
import { describe, expect, it } from 'vitest'
import { mergeChartOptions } from './option-composite'

const obj = (o: Record<string, unknown>) => o as Record<string, unknown>

describe('mergeComponentArray — how an update finds the component it updates', () => {
  it('matches by `id` regardless of position', () => {
    const out = mergeChartOptions(
      obj({ legend: [{ id: 'a', show: true }, { id: 'b', show: true }] }),
      obj({ legend: [{ id: 'b', show: false }] }),
    )
    expect(out['legend']).toEqual([{ id: 'a', show: true }, { id: 'b', show: false }])
  })

  it('matches a NUMERIC id, which is a distinct key from a name', () => {
    const out = mergeChartOptions(obj({ legend: [{ id: 1, show: true }] }), obj({ legend: [{ id: 1, show: false }] }))
    expect(out['legend']).toEqual([{ id: 1, show: false }])
  })

  it('matches by `name` when there is no id', () => {
    const out = mergeChartOptions(
      obj({ legend: [{ name: 'x', show: true }, { name: 'y', show: true }] }),
      obj({ legend: [{ name: 'y', show: false }] }),
    )
    expect(out['legend']).toEqual([{ name: 'x', show: true }, { name: 'y', show: false }])
  })

  it('falls back to POSITION when neither side carries an identity', () => {
    const out = mergeChartOptions(obj({ legend: [{ show: true }, { show: true }] }), obj({ legend: [{ show: false }] }))
    expect(out['legend']).toEqual([{ show: false }, { show: true }])
  })

  it('appends an update entry that matches nothing and has no position to take', () => {
    const out = mergeChartOptions(obj({ legend: [{ id: 'a' }] }), obj({ legend: [{ id: 'a' }, { id: 'new' }] }))
    expect(out['legend']).toHaveLength(2)
    expect((out['legend'] as unknown[])[1]).toEqual({ id: 'new' })
  })

  it('a non-object entry has no identity and cannot be matched by one', () => {
    const out = mergeChartOptions(obj({ legend: [7] }), obj({ legend: [{ id: 'a' }] }))
    // Positional: the update lands on index 0 rather than appending.
    expect(out['legend']).toHaveLength(1)
  })

  it('an id-bearing update never CLAIMS the same previous component twice', () => {
    const out = mergeChartOptions(
      obj({ legend: [{ id: 'a', show: true }] }),
      obj({ legend: [{ id: 'a', show: false }, { id: 'a', show: true }] }),
    )
    // The second entry cannot re-claim index 0, so it is appended.
    expect(out['legend']).toHaveLength(2)
  })
})

describe('replaceMerge — the update decides which components survive', () => {
  it('drops a previous component the update does not name', () => {
    const out = mergeChartOptions(
      obj({ legend: [{ id: 'a', show: true }, { id: 'b', show: true }] }),
      obj({ legend: [{ id: 'b', show: false }] }),
      { replaceMerge: 'legend' },
    )
    expect(out['legend']).toEqual([{ id: 'b', show: false }])
  })

  it('merges INTO the matched component rather than replacing it wholesale', () => {
    const out = mergeChartOptions(
      obj({ legend: [{ id: 'a', show: true, extra: 1 }] }),
      obj({ legend: [{ id: 'a', show: false }] }),
      { replaceMerge: 'legend' },
    )
    expect(out['legend']).toEqual([{ id: 'a', show: false, extra: 1 }])
  })

  it('an unmatched update entry is kept as-is', () => {
    const out = mergeChartOptions(obj({ legend: [{ id: 'a' }] }), obj({ legend: [{ id: 'z' }] }), { replaceMerge: 'legend' })
    expect(out['legend']).toEqual([{ id: 'z' }])
  })

  it('an identity-less update entry is kept as-is rather than matched positionally', () => {
    const out = mergeChartOptions(obj({ legend: [{ id: 'a', show: true }] }), obj({ legend: [{ show: false }] }), {
      replaceMerge: 'legend',
    })
    expect(out['legend']).toEqual([{ show: false }])
  })

  it('a matched NON-object pair takes the update verbatim', () => {
    const out = mergeChartOptions(obj({ legend: [7] }), obj({ legend: [8] }), { replaceMerge: 'legend' })
    expect(out['legend']).toEqual([8])
  })

  it('accepts `replaceMerge` as a list, and leaves keys outside it merging normally', () => {
    const out = mergeChartOptions(
      obj({ legend: [{ id: 'a' }, { id: 'b' }], title: { text: 'keep', sub: 'me' } }),
      obj({ legend: [{ id: 'b' }], title: { text: 'new' } }),
      { replaceMerge: ['legend'] },
    )
    expect(out['legend']).toEqual([{ id: 'b' }])
    // `title` is not in the replaceMerge set, so it deep-merges.
    expect(out['title']).toEqual({ text: 'new', sub: 'me' })
  })
})
