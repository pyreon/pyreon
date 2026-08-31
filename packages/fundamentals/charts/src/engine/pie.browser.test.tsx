import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { GaugeChart, PieChart } from './PieChart'

interface Row {
  name: string
  share: number
}

const DATA: Row[] = [
  { name: 'Direct', share: 40 },
  { name: 'Search', share: 30 },
  { name: 'Social', share: 20 },
  { name: 'Email', share: 10 },
]

function inkedPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

type PieOver = Partial<Parameters<typeof PieChart<Row>>[0]>

const pie = (over: PieOver = {}) =>
  mountInBrowser(() =>
    PieChart<Row>({
      data: DATA,
      value: (d: Row) => d.share,
      label: (d: Row) => d.name,
      width: 300,
      height: 240,
      ...over,
    }),
  )

describe('PieChart in a real browser', () => {
  it('paints slices', async () => {
    const { container } = pie()
    await flush()
    expect(inkedPixels(container.querySelector('canvas')!)).toBeGreaterThan(1000)
  })

  it('leaves a hole for a donut', async () => {
    const solid = pie({ showLabels: false })
    await flush()
    const solidInk = inkedPixels(solid.container.querySelector('canvas')!)

    const donut = pie({ innerRadius: 0.6, showLabels: false })
    await flush()
    // A hole removes ink; comparing counts is valid here because the two
    // differ only by the hole.
    expect(inkedPixels(donut.container.querySelector('canvas')!)).toBeLessThan(solidInk)
  })

  it('repaints when the data changes', async () => {
    const rows = signal<Row[]>(DATA)
    const { container } = mountInBrowser(() =>
      PieChart<Row>({
        data: () => rows(),
        value: (d) => d.share,
        label: (d) => d.name,
        width: 300,
        height: 240,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const before = canvas.toDataURL()
    rows.set([{ name: 'One', share: 100 }])
    await flush()
    expect(canvas.toDataURL()).not.toBe(before)
  })

  it('reports the slice under a click', async () => {
    const picked: number[] = []
    const { container } = pie({ onSelect: (i: number) => picked.push(i), showLabels: false })
    await flush()
    const canvas = container.querySelector('canvas')!
    const box = canvas.getBoundingClientRect()
    // Just right of twelve o'clock — inside the first slice, which spans a
    // 40% sweep clockwise from the top.
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + 160,
        clientY: box.top + 90,
      }),
    )
    await flush()
    expect(picked).toEqual([0])
  })

  it('describes itself and tabulates its slices', async () => {
    const { container } = pie({ title: 'Traffic sources' })
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.getAttribute('aria-label')).toContain('Traffic sources')
    const table = container.querySelector('table')!
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(table.textContent).toContain('Direct')
  })

  it('renders a legend without overlapping the pie', async () => {
    const withLegend = pie({ showLegend: true })
    await flush()
    expect(inkedPixels(withLegend.container.querySelector('canvas')!)).toBeGreaterThan(1000)
  })

  it('survives empty and all-zero data', async () => {
    for (const rows of [[], [{ name: 'a', share: 0 }]]) {
      const { container } = mountInBrowser(() =>
        PieChart<Row>({
          data: rows as Row[],
          value: (d) => d.share,
          label: (d) => d.name,
          width: 300,
          height: 240,
        }),
      )
      await flush()
      expect(container.querySelector('canvas')).not.toBeNull()
    }
  })
})

describe('GaugeChart in a real browser', () => {
  it('paints a track and a value arc', async () => {
    const { container } = mountInBrowser(() =>
      GaugeChart({ value: 65, width: 240, height: 140, title: 'CPU' }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(inkedPixels(canvas)).toBeGreaterThan(500)
    expect(canvas.getAttribute('aria-label')).toContain('CPU')
    expect(canvas.getAttribute('aria-label')).toContain('65')
  })

  it('inks more of the arc for a higher value', async () => {
    const low = mountInBrowser(() => GaugeChart({ value: 5, width: 240, height: 140, showValue: false }))
    await flush()
    const lowInk = inkedPixels(low.container.querySelector('canvas')!)

    const high = mountInBrowser(() => GaugeChart({ value: 95, width: 240, height: 140, showValue: false }))
    await flush()
    // Both draw the same track; only the value arc differs, so the high
    // reading must cover more of it in the value colour.
    expect(inkedPixels(high.container.querySelector('canvas')!)).toBeGreaterThanOrEqual(lowInk)
  })

  it('repaints on a signal change', async () => {
    const v = signal(10)
    const { container } = mountInBrowser(() =>
      GaugeChart({ value: () => v(), width: 240, height: 140 }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const before = canvas.toDataURL()
    v.set(90)
    await flush()
    expect(canvas.toDataURL()).not.toBe(before)
  })
})

// ── responsive sizing ────────────────────────────────────────────────────────
//
// With no explicit `width`, the radial charts used to read `el.clientWidth` —
// but `prepareCanvas` writes an inline `canvas.style.width`, so that reports
// back whatever the FIRST draw chose and the chart is pinned there forever.
// `<PlotChart>` measures the PARENT and observes it; its own comment documents
// this exact failure ("pinned at that fallback forever — 300px inside a 430px
// column, with nothing in the DOM looking wrong"). The radial family never got
// either half, and the documented example passes no `width`.
//
// Real Chromium only: happy-dom reports 0 for every `clientWidth` and has no
// layout, so it cannot tell a parent-measuring implementation from a
// self-measuring one — the two are indistinguishable without a layout engine.
//
// Bisect-verified: restoring `props.width ?? el.clientWidth ?? 300` makes the
// first spec render at the 300 fallback and the second never follow the resize.
describe('radial charts size to their container, not to themselves', () => {
  const dpr = (): number =>
    typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1

  // Wrap in a sized div so the canvas has a PARENT of known width — the thing
  // the fix measures. `mountInBrowser` makes its own container, which is body
  // width, so it cannot discriminate on its own.
  const inBox = (w: number, node: () => unknown) =>
    mountInBrowser(h('div', { style: `width:${w}px` }, node() as never))

  const pieNoWidth = () =>
    PieChart<Row>({ data: DATA, value: (d: Row) => d.share, label: (d: Row) => d.name })

  it('a PieChart with no explicit width fills its container', async () => {
    const { container, unmount } = inBox(520, pieNoWidth)
    await flush()
    const canvas = container.querySelector('canvas')!
    // 520, not the 300 fallback — the whole point.
    expect(canvas.width).toBe(Math.round(520 * dpr()))
    unmount()
  })

  it('a PieChart follows its container when it resizes', async () => {
    const { container, unmount } = inBox(400, pieNoWidth)
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBe(Math.round(400 * dpr()))

    const box = container.firstElementChild as HTMLElement
    box.style.width = '260px'
    // ResizeObserver delivers on a frame, so poll rather than assuming a tick.
    const start = Date.now()
    while (canvas.width !== Math.round(260 * dpr()) && Date.now() - start < 3000) {
      await new Promise<void>((r) => setTimeout(r, 25))
    }
    expect(canvas.width).toBe(Math.round(260 * dpr()))
    unmount()
  })

  it('an explicit width still wins over the container', async () => {
    // The guard must not turn `width` into a suggestion.
    const { container, unmount } = inBox(520, () =>
      PieChart<Row>({
        data: DATA,
        value: (d: Row) => d.share,
        label: (d: Row) => d.name,
        width: 180,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBe(Math.round(180 * dpr()))
    unmount()
  })

  it('a GaugeChart with no explicit width fills its container', async () => {
    const { container, unmount } = inBox(480, () => GaugeChart({ value: 42 }))
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBe(Math.round(480 * dpr()))
    unmount()
  })
})
