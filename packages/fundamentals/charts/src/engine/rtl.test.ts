import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { bars, line } from './marks'
import { mirrorCmds, mirrorPoint, mirrorX } from './rtl'
import type { DrawCmd } from './types'

/**
 * The mirror's contract, stated as properties rather than as pixel
 * expectations: a golden would lock in one chart's numbers, while these hold
 * for every chart there is.
 */
describe('rtl — the mirror', () => {
  const W = 400

  it('mirrors an x about the canvas centreline', () => {
    expect(mirrorX(0, W)).toBe(400)
    expect(mirrorX(400, W)).toBe(0)
    expect(mirrorX(200, W)).toBe(200)
    expect(mirrorPoint({ x: 30, y: 7 }, W)).toEqual({ x: 370, y: 7 })
  })

  it('mirrors a rect by its FAR edge, so its width is unchanged', () => {
    // The bug this pins: mirroring `x` alone moves every rect by its own
    // width, which reads as a chart that is subtly off rather than as a
    // broken mirror.
    const [m] = mirrorCmds([{ kind: 'rect', rect: { x: 10, y: 0, w: 40, h: 5 }, fill: '#f00' }], W)
    expect(m).toMatchObject({ kind: 'rect', rect: { x: 350, y: 0, w: 40, h: 5 } })
  })

  it('swaps corner radii left-to-right', () => {
    const [m] = mirrorCmds(
      [{ kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 }, fill: '#f00', corners: [1, 2, 3, 4] }],
      W,
    )
    // [tl, tr, br, bl] -> [tr, tl, bl, br]
    expect((m as { corners: number[] }).corners).toEqual([2, 1, 4, 3])
  })

  it('flips a text anchor but never the string', () => {
    const [m] = mirrorCmds(
      [{ kind: 'text', text: 'Revenue', at: { x: 10, y: 5 }, fill: '#000', size: 11, align: 'end', baseline: 'middle' }],
      W,
    )
    expect(m).toMatchObject({ text: 'Revenue', at: { x: 390, y: 5 }, align: 'start' })
  })

  it('negates a rotated label so it stays with its tick', () => {
    const [m] = mirrorCmds(
      [{ kind: 'text', text: 'Mon', at: { x: 10, y: 5 }, fill: '#000', size: 11, align: 'end', baseline: 'middle', rotate: -35 }],
      W,
    )
    expect((m as { rotate: number }).rotate).toBe(35)
  })

  it('mirrors a gradient axis with the shape it paints', () => {
    const [m] = mirrorCmds(
      [{
        kind: 'rect',
        rect: { x: 0, y: 0, w: 10, h: 10 },
        fill: '#f00',
        grad: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, stops: [{ offset: 0, color: '#000' }] },
      }],
      W,
    )
    expect((m as { grad: { from: { x: number }; to: { x: number } } }).grad).toMatchObject({
      from: { x: 400 },
      to: { x: 300 },
    })
  })

  it('is an involution — mirroring twice returns the original list', () => {
    // The property that catches a kind the mirror forgot: anything left
    // untouched still round-trips, but anything mirrored ASYMMETRICALLY does
    // not, and a half-handled command is the likely bug.
    const cmds: DrawCmd[] = [
      { kind: 'rect', rect: { x: 12, y: 3, w: 40, h: 9 }, fill: '#123', corners: [1, 2, 3, 4] },
      { kind: 'line', from: { x: 1, y: 2 }, to: { x: 300, y: 4 }, stroke: '#456', width: 2 },
      { kind: 'polyline', points: [{ x: 5, y: 1 }, { x: 60, y: 2 }], stroke: '#789', width: 1 },
      { kind: 'polygon', points: [{ x: 5, y: 1 }, { x: 60, y: 2 }, { x: 9, y: 8 }], fill: '#abc' },
      { kind: 'circle', center: { x: 77, y: 4 }, radius: 3, fill: '#def' },
      { kind: 'text', text: 'x', at: { x: 8, y: 9 }, fill: '#000', size: 10, align: 'start', baseline: 'top' },
    ]
    expect(mirrorCmds(mirrorCmds(cmds, W), W)).toEqual(cmds)
  })

  it('covers every command kind', () => {
    // Totality, not a spot check: a kind added to the union without a mirror
    // arm would fall through and be returned unmirrored, which is invisible
    // until a chart using it looks wrong in one locale.
    const kinds: DrawCmd[] = [
      { kind: 'rect', rect: { x: 1, y: 0, w: 2, h: 2 }, fill: '#000' },
      { kind: 'line', from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, stroke: '#000', width: 1 },
      { kind: 'polyline', points: [{ x: 1, y: 0 }], stroke: '#000', width: 1 },
      { kind: 'polygon', points: [{ x: 1, y: 0 }], fill: '#000' },
      { kind: 'circle', center: { x: 1, y: 0 }, radius: 1, fill: '#000' },
      { kind: 'text', text: 't', at: { x: 1, y: 0 }, fill: '#000', size: 9, align: 'middle', baseline: 'top' },
    ]
    for (const c of kinds) {
      const [m] = mirrorCmds([c], W)
      expect(JSON.stringify(m), `${c.kind} was returned unmirrored`).not.toBe(JSON.stringify(c))
    }
  })
})

describe('rtl — through the static SVG path', () => {
  const rows = [3, 9, 5]
  const opts = { data: rows, marks: [bars((d: number) => d), line((d: number) => d)], x: (_d: number, i: number) => `c${i}`, width: 300, height: 160 }

  it('an RTL chart is not the LTR one', () => {
    expect(chartToSvg({ ...opts, rtl: true })).not.toBe(chartToSvg(opts))
  })

  it('places the first category on the RIGHT', () => {
    // Read the x of each category label out of the emitted SVG and check the
    // order reverses. This is the user-visible statement of what RTL means,
    // and it goes through the real render + mirror rather than the mirror
    // alone.
    const xsOf = (svg: string): number[] =>
      ['c0', 'c1', 'c2'].map((c) => {
        const m = new RegExp(`<text[^>]*x="([-0-9.]+)"[^>]*>${c}<`).exec(svg)
        return m === null ? Number.NaN : Number(m[1])
      })
    const ltr = xsOf(chartToSvg(opts))
    const rtl = xsOf(chartToSvg({ ...opts, rtl: true }))
    expect(ltr.every((v) => Number.isFinite(v)), `category labels not found in the LTR svg`).toBe(true)
    expect(rtl.every((v) => Number.isFinite(v))).toBe(true)
    expect(ltr[0]! < ltr[2]!, 'LTR should read left to right').toBe(true)
    expect(rtl[0]! > rtl[2]!, 'RTL should read right to left').toBe(true)
  })

  it('moves the value axis into the right gutter', () => {
    // The gutter swap is what makes the mirror a canvas-centreline one rather
    // than a plot-centreline one; without it the value labels would be drawn
    // off the right edge.
    const valueLabelXs = (svg: string): number[] =>
      [...svg.matchAll(/<text[^>]*x="([-0-9.]+)"[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]))
    const ltr = valueLabelXs(chartToSvg(opts))
    const rtl = valueLabelXs(chartToSvg({ ...opts, rtl: true }))
    expect(ltr.length).toBeGreaterThan(0)
    expect(Math.min(...ltr), 'LTR value labels sit in the left gutter').toBeLessThan(60)
    expect(Math.max(...rtl), 'RTL value labels sit in the right gutter').toBeGreaterThan(240)
  })
})
