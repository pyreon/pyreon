// Pre-release audit regressions (2026-09): each spec here reproduced a real
// defect before its fix — see the PR for the per-finding bisect. They stay
// together because they share one theme: an input the type allowed reaching
// a path that never considered it (NaN/Infinity, a `<For>` child, a prop
// declared but never forwarded, an SSR canvas with no box).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { For, Fragment, h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { renderToString } from '@pyreon/runtime-server'
import { query } from '@pyreon/test-utils'
import { chartTable } from './a11y'
import { binValues } from './bin'
import { fiveNumber } from './boxplot'
import { boxplotToSvg } from './boxplot-svg'
import { calendarCellValues, layoutCalendar } from './calendar'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps, CanvasHostSpec } from './canvas-host'
import { canvasSizeAttrs } from './canvas-web'
import { PlotChart } from './Chart'
import { Bar, Line, resolveGrammar } from './grammar'
import { layoutBars, layoutBarsH } from './layout'
import { bars } from './marks'
import { HOST_PASSTHROUGH_KEYS, hostPropsFor } from './OptionChart'
import { DARK_PALETTE, DEFAULT_PALETTE } from './palette'
import { layoutParallel, parallelPlace } from './parallel'
import { parallelRows } from './parallel-web'
import { mirrorX, screenRectX, screenX } from './rtl'
import { extent, isFiniteNumber, makeTicks } from './scale'
import { sonifyValues, valueToHz } from './sonify'
import { layoutGroupedBars } from './stack'
import { tooltipAt } from './tooltip'
import type { Rect } from './types'

describe('scale — non-finite domains (finding 4)', () => {
  it('isFiniteNumber: the native-subset check agrees with Number.isFinite', () => {
    for (const v of [0, 1, -1, 0.5, 1e300, -1e300, NaN, Infinity, -Infinity]) expect(isFiniteNumber(v), String(v)).toBe(Number.isFinite(v))
  })
  it('makeTicks yields ZERO ticks for a non-finite bound, never a thousand NaN labels', () => {
    expect(makeTicks({ min: NaN, max: NaN }, 0, 100, 5)).toEqual([])
    expect(makeTicks({ min: 0, max: Infinity }, 0, 100, 5)).toEqual([])
    expect(makeTicks({ min: -Infinity, max: 1 }, 0, 100, 5)).toEqual([])
    // The finite path is untouched.
    expect(makeTicks({ min: 0, max: 10 }, 0, 100, 5).map((t) => t.value)).toEqual([0, 2, 4, 6, 8, 10])
  })
  it('extent skips non-finite values and returns the documented unit domain when nothing is finite', () => {
    expect(extent([NaN, 3, Infinity, 1, -Infinity])).toEqual({ min: 1, max: 3 })
    expect(extent([NaN, Infinity])).toEqual({ min: 0, max: 1 })
    expect(extent([])).toEqual({ min: 0, max: 1 })
    expect(extent([5])).toEqual({ min: 5, max: 5 })
  })
})

describe('boxplot / bin — Infinity is a dropped input, as the docblock says (finding 5)', () => {
  it('fiveNumber drops Infinity as well as NaN', () => {
    const s = fiveNumber([1, 2, 3, 4, Infinity, -Infinity, NaN, 5])
    expect(s).toEqual(fiveNumber([1, 2, 3, 4, 5]))
    for (const v of [s.min, s.q1, s.median, s.q3, s.max]) expect(Number.isFinite(v)).toBe(true)
  })
  it('boxplotToSvg with an Infinity observation emits no NaN geometry', () => {
    const svg = boxplotToSvg<number[]>({ data: [[1, 2, 3, 4, Infinity]], values: (d) => d, width: 300, height: 200 })
    expect(svg).not.toContain('NaN')
    expect(svg.length).toBeLessThan(20_000)
  })
  it('binValues drops Infinity', () => {
    const bins = binValues([1, 2, 3, Infinity, NaN], 3)
    expect(bins.length).toBeGreaterThan(0)
    for (const b of bins) expect(Number.isFinite(b.x0) && Number.isFinite(b.x1)).toBe(true)
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3)
  })
})

describe('sonify — one owned AudioContext, closed when the run settles (finding 6)', () => {
  const stubAudio = () => {
    const counts = { constructed: 0, closed: 0, live: 0, maxLive: 0 }
    const osc = { type: 'sine', frequency: { setValueAtTime: () => undefined }, connect: () => undefined, disconnect: () => undefined, start: () => undefined, stop: () => undefined }
    const gain = { gain: { setValueAtTime: () => undefined }, connect: () => undefined, disconnect: () => undefined }
    class FakeAudioContext {
      currentTime = 0
      state = 'running'
      destination = {}
      constructor() {
        counts.constructed++
        counts.live++
        if (counts.live > counts.maxLive) counts.maxLive = counts.live
      }
      resume() { return Promise.resolve() }
      close() { counts.closed++; counts.live--; return Promise.resolve() }
      createOscillator() { return osc }
      createGain() { return gain }
    }
    const prev = (globalThis as { AudioContext?: unknown }).AudioContext
    ;(globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext
    return { counts, restore: () => { (globalThis as { AudioContext?: unknown }).AudioContext = prev }, make: () => new FakeAudioContext() as unknown as AudioContext }
  }
  it('seven plays never hold more than ONE live context, and every owned one is closed', async () => {
    const a = stubAudio()
    try {
      const s = sonifyValues([1, 2, 3], { duration: 50 })
      for (let i = 0; i < 7; i++) await s.play()
      expect(a.counts.maxLive).toBe(1)
      expect(a.counts.closed).toBe(a.counts.constructed)
      expect(a.counts.live).toBe(0)
    } finally {
      a.restore()
    }
  })
  it('stop() mid-run closes the owned context; a caller-supplied context is NEVER closed', async () => {
    const a = stubAudio()
    try {
      const s = sonifyValues([1, 2, 3], { duration: 2000 })
      void s.play()
      expect(a.counts.live).toBe(1)
      s.stop()
      expect(a.counts.live).toBe(0)
      const theirs = a.make()
      const shared = sonifyValues([1, 2, 3], { duration: 50, context: theirs })
      const before = a.counts.closed
      await shared.play()
      void shared.play()
      shared.stop()
      expect(a.counts.closed).toBe(before)
    } finally {
      a.restore()
    }
  })
})

describe('grammar — <For> children and unrecognized children (finding 7)', () => {
  interface Row { m: string; a: number; b: number }
  const ROWS: Row[] = [{ m: 'x', a: 1, b: 2 }, { m: 'y', a: 3, b: 4 }]
  it('<For each> resolves each item through its render callback, like a .map() child', () => {
    const fields: ('a' | 'b')[] = ['a', 'b']
    const viaMap = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'm' }, fields.map((f) => h(Line<Row>, { y: f, label: f })))
    const viaFor = resolveGrammar<Row>(
      ROWS,
      { data: ROWS, x: 'm' },
      h(For<'a' | 'b'>, { each: () => fields, by: (f: 'a' | 'b') => f, children: (f: 'a' | 'b') => h(Line<Row>, { y: f, label: f }) }),
    )
    expect(viaFor.marks).toHaveLength(2)
    const labels = (g: { marks: { options: { label?: string } }[] }) => g.marks.map((m) => m.options.label)
    expect(labels(viaFor)).toEqual(labels(viaMap))
    expect(labels(viaFor)).toEqual(['a', 'b'])
    // A plain-array `each` and a Fragment inside the callback resolve too.
    const nested = resolveGrammar<Row>(
      ROWS,
      { data: ROWS, x: 'm' },
      h(For<'a' | 'b'>, { each: fields, by: (f: 'a' | 'b') => f, children: (f: 'a' | 'b') => h(Fragment, null, h(Bar<Row>, { y: f })) }),
    )
    expect(nested.marks).toHaveLength(2)
    // The shape JSX actually emits: the render callback is a REST child, not a
    // `children` prop — it lands in `vnode.children[0]`, which is a different
    // read from the props form above and the one a real `<Plot>` hits.
    const asJsx = resolveGrammar<Row>(
      ROWS,
      { data: ROWS, x: 'm' },
      <For each={fields} by={(f) => f}>
        {(f) => h(Line<Row>, { y: f, label: f })}
      </For>,
    )
    expect(labels(asJsx)).toEqual(['a', 'b'])
  })
  it('an unrecognized child warns (dev) instead of vanishing silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const Widget = () => null
      resolveGrammar<Row>(ROWS, { data: ROWS, x: 'm' }, [h(Widget, null), h('div', null)])
      const msgs = warn.mock.calls.map((c) => String(c[0]))
      expect(msgs.some((m) => m.includes('unrecognized child <Widget>'))).toBe(true)
      expect(msgs.some((m) => m.includes('unrecognized child <div>'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('OptionChart — the host passthrough is TOTAL over CanvasHostProps (finding 3)', () => {
  it('forwards every passthrough key, rtl included, and only those', () => {
    const every = {
      option: {},
      width: 640,
      title: 'T',
      tooltip: true,
      keyboard: false,
      toolbox: { saveAsImage: true },
      onSaveImage: () => undefined,
      accessibleTable: false,
      class: 'c',
      rtl: true,
    }
    const out = hostPropsFor(every) as Record<string, unknown>
    for (const k of Object.keys(HOST_PASSTHROUGH_KEYS)) expect(out[k], k).toBe((every as Record<string, unknown>)[k])
    expect(out).toMatchObject({ height: 320, animate: false, updateAnimation: false })
    expect('option' in out).toBe(false)
    // An absent prop is absent (not `undefined`) so the host's defaults apply.
    const bare = hostPropsFor({ option: {} })
    expect(Object.keys(bare).sort()).toEqual(['animate', 'height', 'updateAnimation'])
    // The type is the load-bearing lock (a new CanvasHostProps key must be listed or omitted);
    // this assignment is where it would fail to compile.
    const check: Record<Exclude<keyof CanvasHostProps, 'theme' | 'showTitle' | 'subtitle' | 'showLegend' | 'legendPosition' | 'animate' | 'updateAnimation' | 'updateDuration' | 'height'>, true> = HOST_PASSTHROUGH_KEYS
    expect(Object.keys(check)).toContain('rtl')
  })
})

describe('SSR canvas carries its box (finding 8)', () => {
  it('canvasSizeAttrs emits the style box + attributes; width only when explicit', () => {
    expect(canvasSizeAttrs(400, 200, false)).toEqual({ style: 'width:400px;height:200px', width: 400, height: 200 })
    expect(canvasSizeAttrs(undefined, 200, true)).toEqual({ style: 'height:200px;touch-action:none', height: 200 })
  })
  it('<PlotChart> and the shared host render a sized <canvas> on the server', async () => {
    const html = await renderToString(h(() => PlotChart<{ m: string; v: number }>({ data: [{ m: 'a', v: 1 }], x: (d) => d.m, marks: [bars((d) => d.v)], width: 400, height: 200, dataZoom: true }), null))
    const canvas = /<canvas[^>]*>/.exec(html)?.[0] ?? ''
    expect(canvas).toContain('width="400"')
    expect(canvas).toContain('height="200"')
    expect(canvas).toMatch(/style="[^"]*width:400px;height:200px;touch-action:none/)
    type L = { box: Rect }
    const spec: CanvasHostSpec<L> = {
      props: { height: 150 },
      defaultHeight: 120,
      caption: 'd',
      track: () => undefined,
      layout: (box) => ({ box }),
      render: () => [],
      a11y: () => ({ categories: ['c'], series: [{ label: 'v', values: [1], kind: 'bars' }] }),
    }
    const hostHtml = await renderToString(h(() => canvasHost(spec), null))
    const hostCanvas = /<canvas[^>]*>/.exec(hostHtml)?.[0] ?? ''
    expect(hostCanvas).toContain('height="150"')
    expect(hostCanvas).not.toContain('width=')
    expect(hostCanvas).toMatch(/style="height:150px"/)
  })
})

describe('doc rot (finding 9)', () => {
  it('every test path an engine comment cites EXISTS', () => {
    // `rtl.ts` pointed at a `mirror-parity.test.ts` that has never existed —
    // a reader following it concludes the mirror is unverified. A comment
    // naming a file is a claim, so it is checked like one.
    const here = dirname(fileURLToPath(import.meta.url))
    const root = join(here, '../../../../..')
    const cited = new Set<string>()
    for (const f of readdirSync(here)) {
      if (!/\.tsx?$/.test(f) || f.includes('.test.')) continue
      for (const m of readFileSync(join(here, f), 'utf8').matchAll(/`([\w./-]*[\w-]+\.test\.tsx?)`/g)) cited.add(`${f}|${m[1]!}`)
    }
    expect(cited.size, 'no cited test paths found — the scan is broken, not the comments').toBeGreaterThan(0)
    // A repo-relative path resolves from the root; a bare name from beside the citing file.
    const missing = [...cited].filter((c) => {
      const path = c.split('|')[1]!
      return !existsSync(path.includes('/') ? join(root, path) : join(here, path))
    })
    expect(missing, 'an engine comment names a test file that does not exist').toEqual([])
  })

  it('palettes are readonly at the type level and untouched at runtime', () => {
    // @ts-expect-error — a readonly array has no push
    expect(() => DEFAULT_PALETTE.push).not.toThrow()
    expect(DEFAULT_PALETTE).toHaveLength(10)
    expect(DARK_PALETTE).toHaveLength(10)
  })
})

describe('rtl — the chart → screen half of the seam (finding 1)', () => {
  it('screenX is identity in LTR and mirrorX under rtl; a box mirrors by its far edge', () => {
    expect(screenX(30, 400, false)).toBe(30)
    expect(screenX(30, 400, true)).toBe(mirrorX(30, 400))
    expect(screenRectX(30, 50, 400, false)).toBe(30)
    expect(screenRectX(30, 50, 400, true)).toBe(400 - 30 - 50)
  })
  it('the host tooltip lands on the pointer side under rtl (happy-dom wiring; pixels in the browser suite)', () => {
    const calls: string[] = []
    type L = { box: Rect }
    const props: CanvasHostProps = { tooltip: true, animate: false, rtl: true, width: 300, height: 120 }
    const spec: CanvasHostSpec<L> = {
      props,
      defaultHeight: 120,
      caption: 'd',
      track: () => undefined,
      layout: (box) => ({ box }),
      render: () => [],
      tooltip: () => ['hit'],
      a11y: () => ({ categories: ['c'], series: [{ label: 'v', values: [1], kind: 'bars' }] }),
      select: () => calls.push('s'),
    }
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => (k === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : k in t ? t[k] : () => undefined),
      set: (t, k, v) => { t[k] = v; return true },
    })
    const prevGet = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(canvasHost(spec), root)
    try {
      const canvas = query<HTMLCanvasElement>(root, 'canvas')
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 120, right: 300, bottom: 120, x: 0, y: 0, toJSON: () => ({}) })
      const tip = query<HTMLDivElement>(root, '[data-pyreon-chart-tooltip]')
      Object.defineProperty(tip, 'offsetWidth', { value: 40 })
      Object.defineProperty(tip, 'offsetHeight', { value: 20 })
      // Pointer at screen x=40 (near the LEFT edge). Chart-space x is 260; the
      // chart-space placement puts the box at 272 (right of the pointer) — a
      // raw write lands it 232px away, on the far side of the canvas.
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 30, bubbles: true }))
      expect(tip.style.display).toBe('block')
      const left = parseFloat(tip.style.left)
      expect(Math.abs(left + 40 / 2 - 40), `tooltip left=${left} should sit within a box-width of the pointer at 40`).toBeLessThan(40 + 12)
    } finally {
      dispose()
      root.remove()
      HTMLCanvasElement.prototype.getContext = prevGet
    }
  })
})

describe('an Infinity is a GAP wherever a NaN was one (finding 5, the class)', () => {
  const PLOT: Rect = { x: 0, y: 0, w: 100, h: 100 }
  const finiteRects = (rs: { x: number; y: number; w: number; h: number }[]) =>
    rs.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h))

  it('bar geometry: an Infinity draws the zero-height gap bar, never an infinite rect', () => {
    const withInf = layoutBars([1, Infinity, 3], PLOT, { min: 0, max: 3 }, 0.2)
    expect(finiteRects(withInf)).toBe(true)
    expect(withInf).toEqual(layoutBars([1, NaN, 3], PLOT, { min: 0, max: 3 }, 0.2))
    const h = layoutBarsH([1, -Infinity, 3], PLOT, { min: 0, max: 3 }, 0.2)
    expect(finiteRects(h)).toBe(true)
    expect(h).toEqual(layoutBarsH([1, NaN, 3], PLOT, { min: 0, max: 3 }, 0.2))
    const g = layoutGroupedBars([[1, Infinity]], PLOT, { min: 0, max: 3 }, 0.2)
    expect(finiteRects(g.map((s) => s.rect))).toBe(true)
    expect(g).toEqual(layoutGroupedBars([[1, NaN]], PLOT, { min: 0, max: 3 }, 0.2))
  })

  it('parallel coordinates: an Infinity is a gap, not a clamp to the axis end', () => {
    const axis = { name: 'a', x: 0, y0: 0, y1: 100, domain: { min: 0, max: 10 }, ticks: [], isCategory: false, inverse: false }
    expect(parallelPlace(axis, Infinity).ok).toBe(false)
    expect(parallelPlace(axis, NaN).ok).toBe(false)
    expect(parallelPlace(axis, 5).ok).toBe(true)
    // …and it stays out of the auto-domain, which an Infinity would otherwise
    // widen to span everything (every other row then flattens onto one line).
    const inf = layoutParallel([{ name: 'a' }], [[1], [Infinity], [3]], PLOT)
    expect(inf.axes[0]!.domain).toEqual({ min: 1, max: 3 })
    expect(inf.lines[1]!.present[0]).toBe(false)
    // The web row adapter normalises it to the same gap before it gets here.
    expect(parallelRows([{ name: 'a' }], [[Infinity], [2]])[0]![0]).toBeNaN()
  })

  it('calendar: an Infinity datum is ignored like a bad date', () => {
    const layout = layoutCalendar('2024-01-01', '2024-01-07', PLOT)
    const v = calendarCellValues(layout, [{ date: '2024-01-02', value: Infinity }, { date: '2024-01-03', value: 4 }])
    expect(v.has.filter(Boolean)).toHaveLength(1)
    expect(v.value.every((n) => Number.isFinite(n))).toBe(true)
  })

  it('the tooltip and the accessible table read what was MEASURED, never "Infinity"', () => {
    const tip = tooltipAt(0, ['c'], [{ label: 'v', values: [Infinity], color: '#1' }, { label: 'w', values: [2], color: '#2' }])
    expect(tip.rows.map((r) => r.label)).toEqual(['w'])
    const table = chartTable({ categories: ['a', 'b'], series: [{ label: 'v', values: [Infinity, 2], kind: 'bars' }] })
    expect(table.rows[0]![1]).toBe('')
    expect(table.rows[1]![1]).toBe('2')
  })

  it('sonify: a non-finite value is silence, and a non-finite hz option never reaches setValueAtTime', () => {
    expect(valueToHz(Infinity, [0, 10], 200, 800)).toBeNaN()
    expect(valueToHz(-Infinity, [0, 10], 200, 800)).toBeNaN()
    expect(valueToHz(NaN, [0, 10], 200, 800)).toBeNaN()
    // A finite value outside the domain still clamps, as documented.
    expect(valueToHz(99, [0, 10], 200, 800)).toBe(800)
    expect(valueToHz(-99, [0, 10], 200, 800)).toBe(200)
  })
})

describe('rtl — an SVG export is the chart the user SEES (finding 2)', () => {
  interface Row { m: string; v: number }
  const ROWS: Row[] = [{ m: 'a', v: 1 }, { m: 'b', v: 9 }]
  // `saveAsImage` serializes `lastFrame`, which is written in the paint pass.
  // It was written BEFORE the rtl mirror, so the SVG was the un-mirrored
  // chart while the PNG (`toDataURL` of the painted pixels) was mirrored.
  const savedSvg = (rtl: boolean): string => {
    const got: string[] = []
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => (k === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : k in t ? t[k] : () => undefined),
      set: (t, k, v) => { t[k] = v; return true },
    })
    const prevGet = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(
      h(() => PlotChart<Row>({ data: ROWS, x: (d) => d.m, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false, rtl, toolbox: { saveAsImage: 'svg' }, onSaveImage: (s) => got.push(s) }), null),
      root,
    )
    try {
      const canvas = query<HTMLCanvasElement>(root, 'canvas')
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
      // The save button is the rightmost toolbox box, drawn at the top-right
      // in CHART space; `localX` mirrors the pointer back in, so the same
      // chart-space point is the hit in both directions.
      const at = rtl ? 400 - 392 : 392
      canvas.dispatchEvent(new MouseEvent('click', { clientX: at, clientY: 9, bubbles: true }))
      expect(got, `no save fired (rtl=${rtl})`).toHaveLength(1)
      return got[0]!
    } finally {
      dispose()
      root.remove()
      HTMLCanvasElement.prototype.getContext = prevGet
    }
  }

  it('the rtl export differs from the ltr one and is its mirror', () => {
    const ltr = savedSvg(false)
    const rtl = savedSvg(true)
    expect(ltr).toContain('<svg')
    expect(rtl).toContain('<svg')
    // The whole bug: `lastFrame` was captured before the mirror, so the two
    // exports were byte-identical while the PNG (the painted pixels) was not.
    expect(rtl).not.toBe(ltr)
    // The mirror is exact. Read the CATEGORY LABELS rather than the bars: a
    // bar is a rounded-rect `<path>` whose `d` mixes in the corner radii,
    // while a label is one anchored point that must land at `400 - x`.
    const labelX = (svg: string, text: string): number => {
      const m = new RegExp(`<text x="([-\\d.]+)"[^>]*>${text}</text>`).exec(svg)
      expect(m, `no <text> for "${text}"`).not.toBeNull()
      return Number(m![1])
    }
    for (const cat of ['a', 'b']) expect(labelX(rtl, cat), cat).toBeCloseTo(400 - labelX(ltr, cat), 6)
    // Two different categories, so the mirror is not vacuously satisfied by
    // a chart whose labels happen to sit on the centreline.
    expect(labelX(ltr, 'a')).not.toBeCloseTo(labelX(ltr, 'b'), 1)
    // The bars move with them: the taller bar's path starts on the other side.
    const firstBarX = (svg: string) => Number(/<path d="M([-\d.]+) /.exec(svg)![1])
    expect(firstBarX(ltr)).toBeLessThan(200)
    expect(firstBarX(rtl)).toBeGreaterThan(200)
  })
})
