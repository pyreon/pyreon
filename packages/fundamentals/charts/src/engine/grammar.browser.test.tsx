// The grammar in real Chromium: `<Plot>` with mark children paints through
// `<PlotChart>`, a data flip repaints in place, and a `<Show>` around a mark
// adds and removes its series.
import { h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Arc, Bar, Line, Plot, Tip, chartThemes } from '../plot'

interface Row { q: string; v: number; w: number }
const rows = signal<Row[]>([{ q: 'a', v: 5, w: 2 }, { q: 'b', v: 9, w: 4 }])

function rowColours(canvas: HTMLCanvasElement, fy: number): Set<string> {
  const ctx = canvas.getContext('2d')!
  const y = Math.round(canvas.height * fy)
  const d = ctx.getImageData(0, y, canvas.width, 1).data
  const set = new Set<string>()
  for (let x = 0; x < canvas.width; x++) if (d[x * 4 + 3]! > 200) set.add('#' + [d[x * 4]!, d[x * 4 + 1]!, d[x * 4 + 2]!].map((n) => n.toString(16).padStart(2, '0')).join(''))
  return set
}

describe('<Plot> grammar', () => {
  it('paints bar and line marks with the theme palette, and repaints in place on a data flip', async () => {
    const { container, unmount } = mountInBrowser(
      h(Plot<Row>, { data: () => rows(), x: 'q', width: 240, height: 160, animate: false, updateAnimation: false, showGrid: false }, h(Bar<Row>, { y: 'v' }), h(Line<Row>, { y: 'w', width: 3 }), h(Tip, {})),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(rowColours(canvas, 0.7).has(chartThemes.light.palette[0]!)).toBe(true)
    expect(container.querySelector('[data-pyreon-chart-tooltip]')).not.toBeNull()
    const before = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.join(',')
    rows.set([{ q: 'a', v: 1, w: 1 }, { q: 'b', v: 2, w: 1 }])
    await flush()
    expect(container.querySelector('canvas')).toBe(canvas)
    expect(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.join(',')).not.toBe(before)
    unmount()
  })
  it('a <Show> around a mark adds and removes its series', async () => {
    const withLine = signal(false)
    const data: Row[] = [{ q: 'a', v: 5, w: 2 }, { q: 'b', v: 9, w: 4 }]
    const { container, unmount } = mountInBrowser(
      h(Plot<Row>, { data, x: 'q', width: 240, height: 160, animate: false, updateAnimation: false, showGrid: false }, h(Bar<Row>, { y: 'v' }), h(Show, { when: () => withLine() }, () => h(Line<Row>, { y: 'w', color: '#ff0000', width: 4 }))),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const red = () => [...rowColours(canvas, 0.5), ...rowColours(canvas, 0.6), ...rowColours(canvas, 0.75)].some((c) => c.startsWith('#f') && c.endsWith('00') && c !== '#ffff00')
    expect(red()).toBe(false)
    withLine.set(true)
    await flush()
    expect(red()).toBe(true)
    unmount()
  })
  it('a family mark renders its host: <Arc> paints a pie with the theme palette and reports the slice index on click', async () => {
    interface Slice { name: string; pct: number }
    const slices: Slice[] = [{ name: 'a', pct: 60 }, { name: 'b', pct: 40 }]
    const picked: number[] = []
    const { container, unmount } = mountInBrowser(
      h(Plot<Slice>, { data: slices, width: 200, height: 200, animate: false, onSelect: (i: number) => picked.push(i) }, h(Arc<Slice>, { value: 'pct', label: 'name' })),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    // The middle row crosses both slices: the first two palette colours are present, and nothing the plot host would draw (its grid) is.
    const mid = rowColours(canvas, 0.5)
    expect(mid.has(chartThemes.light.palette[0]!)).toBe(true)
    expect(mid.has(chartThemes.light.palette[1]!)).toBe(true)
    canvas.dispatchEvent(new MouseEvent('click', { clientX: canvas.getBoundingClientRect().left + 150, clientY: canvas.getBoundingClientRect().top + 100, bubbles: true }))
    expect(picked.length).toBe(1)
    expect(picked[0]).toBeGreaterThanOrEqual(0)
    unmount()
  })
})
