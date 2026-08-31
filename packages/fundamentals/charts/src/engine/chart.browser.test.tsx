import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { compact } from './format'
import { PlotChart } from './Chart'
import { bars, groupedBars, line, stackedBars } from './marks'

interface Row {
  month: string
  revenue: number
  target: number
}

const DATA: Row[] = [
  { month: 'Jan', revenue: 100, target: 120 },
  { month: 'Feb', revenue: 180, target: 130 },
  { month: 'Mar', revenue: 140, target: 140 },
  { month: 'Apr', revenue: 220, target: 150 },
]

/** Count non-transparent pixels — proof that something was actually painted. */
function inkedPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('PlotChart renders real pixels in a real browser', () => {
  it('paints a bar chart', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        x: (d) => d.month,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    // A canvas that exists but was never drawn to is the failure this guards:
    // every structural assertion passes against a blank one.
    expect(inkedPixels(canvas!)).toBeGreaterThan(500)
  })

  it('sizes the backing store for the device pixel ratio', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        // Geometry test: sample the finished frame, not the entrance tween.
        animate: false,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const dpr = globalThis.devicePixelRatio ?? 1
    expect(canvas.width).toBe(Math.round(400 * dpr))
    expect(canvas.style.width).toBe('400px')
  })

  /**
   * The load-bearing reactivity test. Comparing pixel COUNTS would pass on a
   * chart that never repainted whenever the two datasets happened to ink a
   * similar area, so this compares the actual image bytes.
   */
  it('repaints when the data signal changes', async () => {
    const rows = signal<Row[]>(DATA)
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: () => rows(),
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const before = canvas.toDataURL()

    rows.set([
      { month: 'Jan', revenue: 20, target: 0 },
      { month: 'Feb', revenue: 30, target: 0 },
      { month: 'Mar', revenue: 250, target: 0 },
      { month: 'Apr', revenue: 40, target: 0 },
    ])
    await flush()
    expect(canvas.toDataURL()).not.toBe(before)
  })

  it('paints more ink for a line drawn over bars than for bars alone', async () => {
    const one = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        // Geometry comparison: both frames must be FINISHED, not mid-entrance.
        animate: false,
      }),
    )
    await flush()
    const barsOnly = inkedPixels(one.container.querySelector('canvas')!)

    const two = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue), line((d) => d.target, { color: '#b45309' })],
        width: 400,
        height: 200,
        animate: false,
      }),
    )
    await flush()
    expect(inkedPixels(two.container.querySelector('canvas')!)).toBeGreaterThan(barsOnly)
  })

  it('reports the bar index under a click', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        onSelect: (i) => picked.push(i),
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const box = canvas.getBoundingClientRect()
    // Inside the THIRD band and above the axis gutter. y must clear the bottom
    // gutter the x labels occupy: clicking at y=190 of a 200px chart lands
    // below the plot and correctly reports a miss, which is what the first
    // version of this test actually asserted.
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + 264,
        clientY: box.top + 150,
      }),
    )
    await flush()
    expect(picked).toEqual([2])
  })

  it('reports a miss for a click outside every bar', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        onSelect: (i) => picked.push(i),
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const box = canvas.getBoundingClientRect()
    // Top-left: inside the canvas, above every bar and left of the plot.
    canvas.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: box.left + 2, clientY: box.top + 2 }),
    )
    await flush()
    expect(picked).toEqual([-1])
  })

  it('renders an empty dataset without throwing or inking', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: [],
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        showGrid: false,
        showXAxis: false,
        showYAxis: false,
      }),
    )
    await flush()
    expect(inkedPixels(container.querySelector('canvas')!)).toBe(0)
  })

  /**
   * A11y has to be WIRED, not merely available. An engine that can describe a
   * chart while the component never calls it is the never-wired failure: every
   * unit test of `describeChart` passes and the shipped chart is still a blank
   * rectangle to a screen reader.
   */
  describe('accessibility is wired into the rendered chart', () => {
    it('labels the canvas with a real description', async () => {
      const { container } = mountInBrowser(() =>
        PlotChart<Row>({
          data: DATA,
          x: (d) => d.month,
          marks: [bars((d) => d.revenue)],
          title: 'Monthly revenue',
          seriesLabels: ['Revenue'],
          width: 400,
          height: 200,
        }),
      )
      await flush()
      const canvas = container.querySelector('canvas')!
      expect(canvas.getAttribute('role')).toBe('img')
      const label = canvas.getAttribute('aria-label') ?? ''
      expect(label).toContain('Monthly revenue')
      expect(label).toContain('rising')
      expect(label).toContain('Jan')
    })

    it('emits an offscreen table a screen reader can navigate', async () => {
      const { container } = mountInBrowser(() =>
        PlotChart<Row>({
          data: DATA,
          x: (d) => d.month,
          marks: [bars((d) => d.revenue)],
          title: 'Monthly revenue',
          seriesLabels: ['Revenue'],
          width: 400,
          height: 200,
        }),
      )
      await flush()
      const table = container.querySelector('table')
      expect(table).not.toBeNull()
      expect(table!.querySelectorAll('tbody tr')).toHaveLength(4)
      expect(table!.querySelector('caption')?.textContent).toBe('Monthly revenue')
      expect(table!.textContent).toContain('180')
    })

    /**
     * Offscreen, NOT `display: none` — the latter removes the table from the
     * accessibility tree along with the visual layout, which defeats it.
     */
    it('hides the table visually while leaving it readable', async () => {
      const { container } = mountInBrowser(() =>
        PlotChart<Row>({ data: DATA, marks: [bars((d) => d.revenue)], width: 400, height: 200 }),
      )
      await flush()
      const table = container.querySelector('table')!
      const style = globalThis.getComputedStyle(table)
      // Still IN the accessibility tree: neither of these would be.
      expect(style.display).not.toBe('none')
      expect(style.visibility).not.toBe('hidden')
      // Visibility is decided by the CLIPPED WRAPPER, not the table — a table
      // uses auto layout and keeps its content width regardless. Measuring the
      // table itself reports ~126px on a chart that shows nothing, which is
      // what the first version of this test asserted against.
      const clip = table.parentElement!
      expect(clip.getBoundingClientRect().width).toBeLessThan(5)
      expect(globalThis.getComputedStyle(clip).overflow).toBe('hidden')
    })

    it('can be turned off', async () => {
      const { container } = mountInBrowser(() =>
        PlotChart<Row>({
          data: DATA,
          marks: [bars((d) => d.revenue)],
          width: 400,
          height: 200,
          accessibleTable: false,
        }),
      )
      await flush()
      expect(container.querySelector('table')).toBeNull()
      expect(container.querySelector('canvas')).not.toBeNull()
    })
  })
})

describe('legend, stacking and tooltip in a real browser', () => {
  it('draws a legend and shrinks the plot to make room', async () => {
    const bare = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA, marks: [bars((d) => d.revenue, { label: 'Revenue' })],
        width: 400, height: 200,
      }),
    )
    await flush()
    const withLegend = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA, marks: [bars((d) => d.revenue, { label: 'Revenue' })],
        width: 400, height: 200, showLegend: true,
      }),
    )
    await flush()
    // The legend adds ink of its own, and the plot moves down rather than
    // being drawn over — so the two images must differ.
    expect(withLegend.container.querySelector('canvas')!.toDataURL()).not.toBe(
      bare.container.querySelector('canvas')!.toDataURL(),
    )
  })

  it('stacks bars instead of overlaying them', async () => {
    const stacked = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [
          stackedBars((d) => d.revenue, { label: 'Revenue' }),
          stackedBars((d) => d.target, { label: 'Target' }),
        ],
        width: 400, height: 200,
      }),
    )
    await flush()
    expect(inkedPixels(stacked.container.querySelector('canvas')!)).toBeGreaterThan(500)
  })

  it('groups bars side by side', async () => {
    const grouped = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [
          groupedBars((d) => d.revenue, { label: 'Revenue' }),
          groupedBars((d) => d.target, { label: 'Target' }),
        ],
        width: 400, height: 200,
      }),
    )
    await flush()
    expect(inkedPixels(grouped.container.querySelector('canvas')!)).toBeGreaterThan(500)
  })

  it('gives a second series a different colour by default', async () => {
    const one = mountInBrowser(() =>
      PlotChart<Row>({ data: DATA, marks: [bars((d) => d.revenue)], width: 400, height: 200 }),
    )
    await flush()
    const two = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue), line((d) => d.target)],
        width: 400, height: 200,
      }),
    )
    await flush()
    // A single default colour would render both series identically, which
    // reads as one series.
    expect(two.container.querySelector('canvas')!.toDataURL()).not.toBe(
      one.container.querySelector('canvas')!.toDataURL(),
    )
  })

  describe('tooltip', () => {
    const mountTip = () =>
      mountInBrowser(() =>
        PlotChart<Row>({
          data: DATA, x: (d) => d.month,
          marks: [bars((d) => d.revenue, { label: 'Revenue' })],
          width: 400, height: 200, tooltip: true,
        }),
      )

    it('is absent until the pointer is over a datum', async () => {
      const { container } = mountTip()
      await flush()
      const tip = query<HTMLElement>(container, '[data-pyreon-chart-tooltip]')
      expect(tip.style.display).toBe('none')
    })

    it('shows the category and value under the pointer', async () => {
      const { container } = mountTip()
      await flush()
      const canvas = container.querySelector('canvas')!
      const box = canvas.getBoundingClientRect()
      canvas.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true, clientX: box.left + 264, clientY: box.top + 150,
        }),
      )
      await flush()
      const tip = query<HTMLElement>(container, '[data-pyreon-chart-tooltip]')
      expect(tip.style.display).toBe('block')
      expect(tip.textContent).toContain('Mar')
      expect(tip.textContent).toContain('Revenue')
    })

    it('hides again when the pointer leaves', async () => {
      const { container } = mountTip()
      await flush()
      const canvas = container.querySelector('canvas')!
      const box = canvas.getBoundingClientRect()
      canvas.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true, clientX: box.left + 264, clientY: box.top + 150,
        }),
      )
      await flush()
      canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      await flush()
      const tip = query<HTMLElement>(container, '[data-pyreon-chart-tooltip]')
      expect(tip.style.display).toBe('none')
    })

    /**
     * Without `pointer-events: none` the tooltip sits under the cursor and
     * swallows the next mousemove, so the chart flickers as it hides and
     * reappears.
     */
    it('does not intercept the pointer', async () => {
      const { container } = mountTip()
      await flush()
      const tip = query<HTMLElement>(container, '[data-pyreon-chart-tooltip]')
      expect(globalThis.getComputedStyle(tip).pointerEvents).toBe('none')
    })
  })
})

describe('PlotChart — axis formatting', () => {
  it('formats the axis labels and the accessible description together', async () => {
    // One formatter for every surface, asserted together: an axis that says
    // "3.2M" beside a description that says "3200000" is the failure mode.
    const rows = [
      { month: 'Jan', revenue: 3200000, target: 0 },
      { month: 'Feb', revenue: 1800000, target: 0 },
    ] as Row[]
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: rows,
        x: (d) => d.month,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        format: compact,
        title: 'Revenue',
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const label = canvas.getAttribute('aria-label') ?? ''
    expect(label).toContain('M')
    expect(label).not.toContain('3200000')
  })
})

describe('PlotChart — a continuous x axis', () => {
  interface Reading {
    t: number
    v: number
  }
  const DAY = 86_400_000
  const JAN1 = Date.UTC(2026, 0, 1)
  // Two consecutive days, then a two-month jump.
  const READINGS: Reading[] = [
    { t: JAN1, v: 2 },
    { t: JAN1 + DAY, v: 6 },
    { t: JAN1 + 60 * DAY, v: 4 },
  ]

  it('spaces the points by time, and says so in the description', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Reading>({
        data: READINGS,
        marks: [line((d) => d.v)],
        xValue: (d) => d.t,
        xTime: true,
        width: 400,
        height: 200,
        title: 'Readings',
        animate: false,
        // Chrome OFF so the only ink is the line itself. With the grid on, the
        // topmost painted pixel is the top gridline — which spans the full
        // width and starts at the left edge whatever the spacing, so the
        // assertion below would pass for the wrong reason. (It did, until a
        // bisect showed it passing against index spacing too.)
        showGrid: false,
        showXAxis: false,
        showYAxis: false,
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(canvas.width).toBeGreaterThan(0)

    // The proof that it drew by TIME is WHERE the peak is. The middle reading
    // is the largest value, so the line's highest point sits above it: at the
    // horizontal middle under even spacing, and hard against the left edge
    // under time spacing, because one day into sixty is.
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no 2d context')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let peakX = -1
    let peakY = canvas.height
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3]!
        if (alpha !== 0 && y < peakY) {
          peakY = y
          peakX = x
        }
      }
    }
    expect(peakX, 'nothing was painted').toBeGreaterThanOrEqual(0)
    expect(
      peakX,
      `the line peaks at x=${peakX} of ${canvas.width} — that is the middle, i.e. the points were spaced by INDEX and the chart misstates the gaps`,
    ).toBeLessThan(canvas.width * 0.35)
  })
})

describe('PlotChart — entrance animation and annotations', () => {
  interface V {
    v: number
  }
  const DATA: V[] = [{ v: 10 }, { v: 60 }, { v: 40 }]

  it('with animate off, the FIRST frame is the finished chart', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<V>({
        data: DATA,
        marks: [bars((d) => d.v)],
        width: 300,
        height: 150,
        animate: false,
      }),
    )
    // No flush: sample synchronously after mount, before any rAF could run.
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no ctx')
    const count = (): number => {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++
      return n
    }
    const first = count()
    expect(first).toBeGreaterThan(500)
    await flush()
    await new Promise((r) => setTimeout(r, 500))
    // …and it does not change afterwards: nothing was left mid-tween.
    expect(count()).toBe(first)
  })

  it('by default the chart GROWS: an early frame has less ink than the settled one', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<V>({ data: DATA, marks: [bars((d) => d.v)], width: 300, height: 150 }),
    )
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no ctx')
    const count = (): number => {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++
      return n
    }
    // One frame in: the tween has started but nowhere near settled.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const early = count()
    await new Promise((r) => setTimeout(r, 700))
    const settled = count()
    expect(settled).toBeGreaterThan(500)
    expect(early, 'the entrance never animated — first frame already final').toBeLessThan(settled)
  })

  it('annotations reach the canvas end to end', async () => {
    const paint = async (annotations?: { y: number; label?: string }[]): Promise<string> => {
      const { container, unmount } = mountInBrowser(() =>
        PlotChart<V>({
          data: DATA,
          marks: [bars((d) => d.v)],
          width: 300,
          height: 150,
          animate: false,
          ...(annotations !== undefined ? { annotations } : {}),
        }),
      )
      await flush()
      const canvas = query<HTMLCanvasElement>(container, 'canvas')
      const url = canvas.toDataURL()
      unmount()
      return url
    }
    const plainUrl = await paint()
    const annotated = await paint([{ y: 50, label: 'Target' }])
    // The unit tests pin the geometry; this pins the PASS-THROUGH — a prop
    // that never reaches buildSpec produces a byte-identical canvas.
    expect(annotated).not.toBe(plainUrl)
  })
})
