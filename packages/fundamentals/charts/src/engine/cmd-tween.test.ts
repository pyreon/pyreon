import { describe, expect, it } from 'vitest'
import { sameCmdShape, tweenCmds } from './cmd-tween'
import type { DrawCmd } from './types'

const A: DrawCmd[] = [
  { kind: 'rect', rect: { x: 0, y: 100, w: 10, h: 20 }, fill: '#111' },
  { kind: 'polyline', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], stroke: '#222', width: 1 },
  { kind: 'circle', center: { x: 5, y: 5 }, radius: 2, fill: '#333' },
  { kind: 'text', text: 'Jan', at: { x: 0, y: 0 }, fill: '#444', size: 10, align: 'start', baseline: 'top' },
]
const B: DrawCmd[] = [
  { kind: 'rect', rect: { x: 0, y: 60, w: 10, h: 60 }, fill: '#999' },
  { kind: 'polyline', points: [{ x: 0, y: 10 }, { x: 10, y: 0 }], stroke: '#222', width: 1 },
  { kind: 'circle', center: { x: 15, y: 5 }, radius: 6, fill: '#333' },
  { kind: 'text', text: 'Jan', at: { x: 4, y: 0 }, fill: '#444', size: 10, align: 'start', baseline: 'top' },
]

describe('tweenCmds — the draw-list update animation', () => {
  it('interpolates every placing number halfway and snaps colours to the target', () => {
    const f = tweenCmds(A, B, 0.5)
    expect(f[0]).toMatchObject({ kind: 'rect', rect: { x: 0, y: 80, w: 10, h: 40 }, fill: '#999' })
    expect(f[1]).toMatchObject({ kind: 'polyline', points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] })
    expect(f[2]).toMatchObject({ kind: 'circle', center: { x: 10, y: 5 }, radius: 4 })
    expect(f[3]).toMatchObject({ kind: 'text', at: { x: 2, y: 0 } })
  })

  it('returns the target at t=1 by identity; at t=0 the geometry is the source and the colours already the target', () => {
    expect(tweenCmds(A, B, 1)).toBe(B)
    const f0 = tweenCmds(A, B, 0)
    expect(f0[0]).toMatchObject({ kind: 'rect', rect: { x: 0, y: 100, w: 10, h: 20 }, fill: '#999' })
  })

  it('snaps to the target when the shapes differ (a row added, a kind changed, a label changed)', () => {
    expect(sameCmdShape(A, B)).toBe(true)
    const longer: DrawCmd[] = [...B, { kind: 'circle', center: { x: 0, y: 0 }, radius: 1, fill: '#000' }]
    expect(sameCmdShape(A, longer)).toBe(false)
    expect(tweenCmds(A, longer, 0.5)).toBe(longer)
    const relabelled: DrawCmd[] = B.map((c) => (c.kind === 'text' ? { ...c, text: 'Feb' } : c))
    expect(tweenCmds(A, relabelled, 0.5)).toBe(relabelled)
    const morePoints: DrawCmd[] = B.map((c) => (c.kind === 'polyline' ? { ...c, points: [...c.points, { x: 20, y: 0 }] } : c))
    expect(tweenCmds(A, morePoints, 0.5)).toBe(morePoints)
  })

  it('interpolates a gradient axis and keeps the target stops', () => {
    const g0: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: 1, h: 1 }, fill: '#000', grad: { from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, stops: [{ offset: 0, color: '#a' }] } }
    const g1: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: 1, h: 1 }, fill: '#000', grad: { from: { x: 0, y: 0 }, to: { x: 0, y: 50 }, stops: [{ offset: 0, color: '#b' }] } }
    const f = tweenCmds([g0], [g1], 0.5)[0] as DrawCmd & { kind: 'rect' }
    expect(f.grad).toEqual({ from: { x: 0, y: 0 }, to: { x: 0, y: 75 }, stops: [{ offset: 0, color: '#b' }] })
  })
})
