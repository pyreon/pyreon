// The legend lists series LABELS, as ECharts' lists series names: an area and a
// line both labelled Revenue are ONE entry, and a tap toggles both. Before,
// every series drew its own entry, so the idiomatic area-under-a-line chart
// showed two identical Revenue swatches (seen in the docs gallery).
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { PlotChart } from './Chart'
import { legendEntriesGrouped, legendToggleGroup } from './legend-toggle'
import { area, line, resolveMarks } from './marks'

const LABELS = ['Revenue', 'Revenue', 'Target']
const COLORS = ['#a', '#b', '#c']

describe('legendEntriesGrouped', () => {
  it('one entry per distinct label, in first-appearance order and colour', () => {
    expect(legendEntriesGrouped(LABELS, COLORS, [])).toEqual([
      { label: 'Revenue', color: '#a', muted: false },
      { label: 'Target', color: '#c', muted: false },
    ])
  })

  it('an entry is muted only when every series under it is hidden', () => {
    expect(legendEntriesGrouped(LABELS, COLORS, [0])[0]!.muted).toBe(false)
    expect(legendEntriesGrouped(LABELS, COLORS, [0, 1])[0]!.muted).toBe(true)
  })

  it('distinct labels keep one entry per series, as before', () => {
    expect(legendEntriesGrouped(['A', 'B'], ['#a', '#b'], [1]).map((e) => [e.label, e.muted])).toEqual([
      ['A', false],
      ['B', true],
    ])
  })
})

describe('legendToggleGroup', () => {
  it('a tap on a grouped entry hides every series under it', () => {
    expect([...legendToggleGroup([], LABELS, 0)].sort()).toEqual([0, 1])
  })

  it('a partly hidden group hides the rest; a wholly hidden one shows again', () => {
    expect([...legendToggleGroup([1], LABELS, 0)].sort()).toEqual([0, 1])
    expect(legendToggleGroup([0, 1], LABELS, 0)).toEqual([])
  })

  it('leaves other groups alone, and ignores a tap past the last entry', () => {
    expect(legendToggleGroup([2], LABELS, 0).sort()).toEqual([0, 1, 2])
    expect(legendToggleGroup([2], LABELS, 5)).toEqual([2])
  })
})

describe('PlotChart draws the grouped legend', () => {
  it('an area and a line sharing a label paint ONE legend label', () => {
    const texts: string[] = []
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) =>
        k === 'measureText'
          ? (text: string) => ({ width: text.length * 6 })
          : k === 'fillText'
            ? (text: string) => texts.push(text)
            : k in t
              ? t[k]
              : () => undefined,
      set: (t, k, v) => {
        t[k] = v
        return true
      },
    })
    const prev = HTMLCanvasElement.prototype.getContext
    const root = document.createElement('div')
    let un: (() => void) | undefined
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
    try {
      type Row = { m: string; v: number }
      const rows: Row[] = [{ m: 'Jan', v: 1 }, { m: 'Feb', v: 3 }]
      document.body.appendChild(root)
      un = mount(
        h(PlotChart<Row>, {
          data: rows,
          x: (d: Row) => d.m,
          marks: [area((d: Row) => d.v, { label: 'Revenue' }), line((d: Row) => d.v, { label: 'Revenue' })],
          showLegend: true,
          width: 400,
          height: 200,
          animate: false,
        }),
        root,
      )
      expect(texts.filter((t) => t === 'Revenue')).toHaveLength(1)
    } finally {
      try {
        un?.()
      } finally {
        root.remove()
        HTMLCanvasElement.prototype.getContext = prev
      }
    }
  })
})

describe('mark colour follows the label', () => {
  it('marks sharing a label share a palette colour; distinct labels keep index order', () => {
    type Row = { v: number }
    const rows: Row[] = [{ v: 1 }]
    const s = resolveMarks(rows, [area((d: Row) => d.v, { label: 'Revenue' }), line((d: Row) => d.v, { label: 'Revenue' }), line((d: Row) => d.v, { label: 'Target' })])
    expect(s[0]!.color).toBe(s[1]!.color)
    expect(s[2]!.color).not.toBe(s[0]!.color)
    const d = resolveMarks(rows, [line((d: Row) => d.v, { label: 'A' }), line((d: Row) => d.v, { label: 'B' })])
    expect(d[0]!.color).not.toBe(d[1]!.color)
  })
})
