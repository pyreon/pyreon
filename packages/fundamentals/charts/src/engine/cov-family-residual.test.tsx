// The residual arms of the family engine: the theme provider's own resolution,
// the sonification lifecycle (a second play, a stop before a play, a suspended
// context), the extent scans whose seed hides the "lower than the first point"
// case, and a handful of one-arm edges the ordinary fixtures never reach.
import { ColorModeProvider, h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { ChartThemeProvider, chartThemes, useChartTheme } from './theme'
import type { ChartTheme } from './render'
import { sonifyValues } from './sonify'
import { layoutGeoShapes, renderGeo } from './geo'
import { geoShapes } from './geo-web'
import { sameCmdShape } from './cmd-tween'
import { computeLayout } from './layout'
import { resolveMarks, bars } from './marks'
import { layoutParallel, renderParallel, hitParallelIndex } from './parallel'
import { layoutSankey, renderSankey } from './sankey'
import { hitSunburstIndex } from './sunburst'
import { lttbIndices, minMaxBuckets } from './decimate-values'
import type { DrawCmd } from './types'

const box = { x: 0, y: 0, w: 400, h: 300 }

// ─── the theme provider ──────────────────────────────────────────────────────

describe('chart theme provider', () => {
  const host = (): HTMLDivElement => {
    const el = document.createElement('div')
    document.body.append(el)
    return el
  }
  // The probe hands its ACCESSOR back rather than a rendered value: the theme
  // is live, and a rendered string would be a snapshot of the first read.
  let seen: (() => ChartTheme) | null = null
  const Probe = (): VNodeChild => {
    seen = useChartTheme()
    return h('span', {}, '')
  }
  const label = (): string => seen!().label

  it('the colour mode in scope picks the theme', () => {
    const el = host()
    mount(h(ColorModeProvider, { mode: 'dark' as const, children: h(ChartThemeProvider, { children: h(Probe, {}) }) }) as never, el)
    expect(label()).toBe(chartThemes.dark.label)
  })
  it('a mode ACCESSOR is read live, so a flip re-resolves the theme', () => {
    const el = host()
    const mode = signal<'light' | 'dark'>('light')
    mount(h(ColorModeProvider, { mode: () => mode(), children: h(ChartThemeProvider, { children: h(Probe, {}) }) }) as never, el)
    expect(label()).toBe(chartThemes.light.label)
    mode.set('dark')
    expect(label(), 'a value copy would pin the light label').toBe(chartThemes.dark.label)
  })
  it('a nested provider inherits the parent theme, and its overrides merge over it', () => {
    const el = host()
    mount(
      h(ColorModeProvider, {
        mode: 'dark' as const,
        children: h(ChartThemeProvider, {
          theme: { radius: 9 },
          children: h(ChartThemeProvider, { theme: { label: '#abcdef' }, children: h(Probe, {}) }),
        }),
      }) as never,
      el,
    )
    expect(label()).toBe('#abcdef')
    expect(seen!().radius, "the outer provider's override survives").toBe(9)
    expect(seen!().background, 'and the mode is the one in scope').toBe(chartThemes.dark.background)
  })
  it('a theme ACCESSOR is read live too, and may resolve to nothing', () => {
    const el = host()
    const over = signal<{ label?: string } | undefined>({ label: '#111111' })
    mount(h(ColorModeProvider, { mode: 'light' as const, children: h(ChartThemeProvider, { theme: () => over(), children: h(Probe, {}) }) }) as never, el)
    expect(label()).toBe('#111111')
    over.set(undefined)
    expect(label(), 'an undefined override falls back to the mode theme').toBe(chartThemes.light.label)
  })
})

// The system colour scheme itself (matchMedia, the page-declared scheme) moved
// to @pyreon/core with `systemColorMode`, and is covered there.

// ─── sonification lifecycle ──────────────────────────────────────────────────

interface FakeCtx {
  ctx: AudioContext
  resumed: number
}
const fakeContext = (state: string): FakeCtx => {
  const osc = {
    type: 'sine',
    frequency: { setValueAtTime: () => undefined },
    connect: () => undefined,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
  }
  const gain = { gain: { setValueAtTime: () => undefined }, connect: () => undefined, disconnect: () => undefined }
  const box2 = { resumed: 0 }
  const ctx = {
    currentTime: 0,
    state,
    destination: {},
    resume: () => {
      box2.resumed++
      return Promise.resolve()
    },
    createOscillator: () => osc,
    createGain: () => gain,
  } as unknown as AudioContext
  return {
    ctx,
    get resumed() {
      return box2.resumed
    },
  }
}

describe('sonification lifecycle', () => {
  it('a SUSPENDED context is resumed before the first note', () => {
    const f = fakeContext('suspended')
    const s = sonifyValues([1, 2, 3], { context: f.ctx, duration: 6 })
    void s.play()
    expect(f.resumed).toBe(1)
    s.stop()
  })
  it('a RUNNING context is left alone', () => {
    const f = fakeContext('running')
    const s = sonifyValues([1, 2], { context: f.ctx, duration: 6 })
    void s.play()
    expect(f.resumed).toBe(0)
    s.stop()
  })
  it('stop() before any play() is a no-op, not a crash', () => {
    const s = sonifyValues([1, 2], { context: fakeContext('running').ctx, duration: 6 })
    expect(() => s.stop()).not.toThrow()
    expect(() => s.stop()).not.toThrow()
  })
  it('a SECOND play settles the first one, and both promises resolve', async () => {
    const s = sonifyValues([1, 2], { context: fakeContext('running').ctx, duration: 6 })
    const first = s.play()
    const second = s.play()
    s.stop()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
  })
  it('a per-step callback does NOT fire after stop()', async () => {
    const seen: number[] = []
    const s = sonifyValues([1, 2, 3], { context: fakeContext('running').ctx, duration: 6, onStep: (i) => seen.push(i) })
    void s.play()
    s.stop()
    await new Promise((r) => setTimeout(r, 25))
    expect(seen, 'every queued timer must bail once the run has settled').toEqual([])
  })
  it('an OWNED context is constructed on demand and closed when the run settles', () => {
    // No `context` option: the hook builds its own. happy-dom has no Web
    // Audio, so the constructor is stubbed — the point is the OWNERSHIP
    // bookkeeping (build once per run, close on settle), not the audio.
    let built = 0
    let closed = 0
    const real = (globalThis as { AudioContext?: unknown }).AudioContext
    ;(globalThis as { AudioContext?: unknown }).AudioContext = class {
      currentTime = 0
      state = 'running'
      destination = {}
      constructor() {
        built++
      }
      close(): Promise<void> {
        closed++
        return Promise.resolve()
      }
      resume(): Promise<void> {
        return Promise.resolve()
      }
      createOscillator(): unknown {
        return { type: 'sine', frequency: { setValueAtTime: () => undefined }, connect: () => undefined, disconnect: () => undefined, start: () => undefined, stop: () => undefined }
      }
      createGain(): unknown {
        return { gain: { setValueAtTime: () => undefined }, connect: () => undefined, disconnect: () => undefined }
      }
    }
    try {
      const s = sonifyValues([1, 2], { duration: 6 })
      void s.play()
      expect(built).toBe(1)
      s.stop()
      expect(closed, 'a context left open per play hits the browser cap').toBe(1)
      void s.play()
      expect(built, 'the next run needs a new one').toBe(2)
      s.stop()
    } finally {
      if (real === undefined) delete (globalThis as { AudioContext?: unknown }).AudioContext
      else (globalThis as { AudioContext?: unknown }).AudioContext = real
    }
  })
  it('an EMPTY series settles immediately', async () => {
    const s = sonifyValues([], { context: fakeContext('running').ctx, duration: 6 })
    await expect(s.play()).resolves.toBeUndefined()
  })
})

// ─── extent scans seeded from the first point ────────────────────────────────

describe('geo extent scans', () => {
  // A ring wound from its MAXIMUM corner: the seed is the largest x and the
  // smallest y, so the "lower x" and "higher y" arms of the per-region scan
  // only fire for a ring written this way round.
  // Projection space is Y-UP and the box is Y-DOWN, so the seed's SCREEN y is
  // the ring's highest data y. Starting from (10, 10) makes the first point
  // both the largest x and the smallest screen y, which is the only winding
  // that exercises the "smaller x" and "larger y" arms of the scan.
  const reversed = {
    name: 'r',
    rings: [[{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }]],
  }
  it('a ring wound from its far corner still produces the same bounding box', () => {
    const forward = layoutGeoShapes([{ name: 'r', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]] }], box)
    const backward = layoutGeoShapes([reversed], box)
    expect(backward.regions[0]!.bbox.w).toBeCloseTo(forward.regions[0]!.bbox.w, 9)
    expect(backward.regions[0]!.bbox.h).toBeCloseTo(forward.regions[0]!.bbox.h, 9)
    expect(backward.regions[0]!.bbox.x).toBeCloseTo(forward.regions[0]!.bbox.x, 9)
  })
  it('the LABEL host box is scanned the same way round', () => {
    const l = layoutGeoShapes([reversed], box)
    expect(renderGeo(l, [], { showLabels: true, fontSize: 2 }).some((c) => c.kind === 'text')).toBe(true)
  })
  it('an EMPTY coordinate pair reads as the origin on both halves', () => {
    const shapes = geoShapes({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[], [2, 2], [3, 3]]] } }],
    } as never)
    expect(shapes[0]!.rings[0]![0]).toEqual({ x: 0, y: 0 })
  })
})

// ─── one-arm edges ───────────────────────────────────────────────────────────

describe('draw-list shape comparison rejects a KIND mismatch', () => {
  it('two same-length lists of different kinds cannot interpolate', () => {
    const circle: DrawCmd = { kind: 'circle', center: { x: 0, y: 0 }, radius: 1, fill: '#000' }
    const rect: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: 1, h: 1 }, fill: '#000' }
    expect(sameCmdShape([circle], [rect])).toBe(false)
    expect(sameCmdShape([circle], [circle])).toBe(true)
  })
})

describe('slanted axis labels', () => {
  it('a label narrower than the font height needs NO extra gutter', () => {
    const cfg = {
      width: 400,
      height: 300,
      categories: ['a', 'b', 'c'],
      xDomain: { min: 0, max: 1 },
      yDomain: { min: 0, max: 1 },
      fontSize: 12,
      showXAxis: true,
      showYAxis: true,
      xLabels: 'rotate' as const,
    }
    const tiny = computeLayout(cfg as never, () => 0)
    const wide = computeLayout(cfg as never, () => 80)
    expect(tiny.plot.h, 'no slant gutter means a taller plot').toBeGreaterThan(wide.plot.h)
  })
})

describe('mark error bounds', () => {
  it('a NON-FINITE upper bound resolves to a gap, not an Infinity whisker', () => {
    const rows = [{ v: 1, lo: 0, hi: Number.POSITIVE_INFINITY }, { v: 2, lo: 1, hi: 3 }]
    const series = resolveMarks(rows, [bars<(typeof rows)[number]>((d) => d.v, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })])
    expect(Number.isNaN(series[0]!.errHigh![0]!)).toBe(true)
    expect(series[0]!.errHigh![1]).toBe(3)
  })
})

describe('parallel residuals', () => {
  const axes = [{ label: 'a' }, { label: 'b' }, { label: 'c' }]
  it('a run of two or more points BEFORE a gap is drawn', () => {
    const l = layoutParallel(axes as never, [[1, 2, Number.NaN]], box)
    expect(renderParallel(l).filter((c) => c.kind === 'polyline')).toHaveLength(1)
  })
  it('a point BEYOND a segment is measured to the nearest endpoint, not the infinite line', () => {
    const l = layoutParallel(axes as never, [[1, 2, 3]], box)
    const first = l.lines[0]!.points[0]!
    // Far to the LEFT of the first axis: the projection parameter is negative
    // and must clamp to the segment start.
    expect(hitParallelIndex(l, first.x - 1000, first.y, 5)).toBe(-1)
    expect(hitParallelIndex(l, first.x - 2, first.y, 5)).toBe(0)
    // …and far to the RIGHT of the last axis, where it must clamp to the end.
    const last = l.lines[0]!.points.at(-1)!
    expect(hitParallelIndex(l, last.x + 1000, last.y, 5)).toBe(-1)
    expect(hitParallelIndex(l, last.x + 2, last.y, 5)).toBe(0)
  })
})

describe('sankey residuals', () => {
  it('render progress BELOW zero clamps to zero', () => {
    const l = layoutSankey([{ name: 'a' }, { name: 'b' }], [{ source: 'a', target: 'b', value: 5 }], box)
    expect(renderSankey(l, { progress: -1 })).toEqual(renderSankey(l, { progress: 0 }))
  })
  it('a zero-height box gives every ribbon and band no extent, so nothing is drawn', () => {
    const l = layoutSankey([{ name: 'a' }, { name: 'b' }], [{ source: 'a', target: 'b', value: 5 }], { x: 0, y: 0, w: 400, h: 0 })
    expect(renderSankey(l).filter((c) => c.kind === 'polygon')).toHaveLength(0)
    expect(renderSankey(l).filter((c) => c.kind === 'rect')).toHaveLength(0)
  })
  it('a LONG cycle is cut, and every node still lands at a finite depth', () => {
    const names = ['a', 'b', 'c', 'd', 'e']
    const nodes = names.map((name) => ({ name }))
    const links = names.map((name, i) => ({ source: name, target: names[(i + 1) % names.length]!, value: 1 }))
    const l = layoutSankey(nodes, links, box)
    expect(l.nodes).toHaveLength(5)
    for (const nd of l.nodes) expect(Number.isFinite(nd.rect.x)).toBe(true)
  })
})

describe('sunburst residual', () => {
  it('two arcs at the SAME depth sharing a boundary resolve to the first', () => {
    const at = (start: number, end: number) => ({ name: 'x', value: 1, depth: 0, path: [0], start, end, innerR: 10, outerR: 40, color: '#000000', leaf: true })
    const arcs = [at(0, 1), at(1, 2)]
    const center = { x: 0, y: 0 }
    const r = 25
    // Exactly on the shared edge — inside both by the inclusive test.
    const hit = hitSunburstIndex(arcs, center, Math.cos(1) * r, Math.sin(1) * r)
    expect(hit).toBe(0)
  })
})

describe('decimation residuals', () => {
  it('LTTB over a short tail still returns a strictly increasing index list', () => {
    const n = 40
    const xs = Array.from({ length: n }, (_, i) => i)
    const ys = xs.map((i) => Math.sin(i))
    for (const target of [3, 4, 5, 10, 39]) {
      const idx = lttbIndices(xs, ys, target)
      expect(idx[0]).toBe(0)
      expect(idx.at(-1)).toBe(n - 1)
      for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!)
    }
  })
  it('min/max buckets keep both extremes, and pass short input through untouched', () => {
    const values = Array.from({ length: 100 }, (_, i) => (i === 50 ? 1000 : i))
    const out = minMaxBuckets(values, 5)
    expect(out).toContain(1000)
    expect(out.length).toBeLessThan(values.length)
    expect(minMaxBuckets([1, 2, 3], 5), 'fewer than 2x the bucket count is not worth decimating').toEqual([1, 2, 3])
    expect(minMaxBuckets(values, 0)).toEqual(values)
  })
})
