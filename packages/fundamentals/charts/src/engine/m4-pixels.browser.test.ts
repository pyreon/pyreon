// M4 must draw the same pixels as the full polyline — that is its whole claim.
import { describe, expect, it } from 'vitest'
import { m4Pixels } from './decimate-values'
import { paint } from './canvas-web'
import type { DrawCmd, Pt } from './types'

function pixels(points: Pt[]): Uint8ClampedArray {
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 200
  const ctx = c.getContext('2d')!
  const cmds: DrawCmd[] = [{ kind: 'polyline', points, stroke: '#1d4ed8', width: 1.5 }]
  paint(ctx, cmds, c.width, c.height, 'sans-serif')
  return ctx.getImageData(0, 0, c.width, c.height).data
}

describe('m4Pixels', () => {
  it('a dense noisy line covers the same pixels from a fraction of the points', () => {
    const pts: Pt[] = []
    let seed = 7
    for (let i = 0; i < 60_000; i++) {
      seed = (seed * 16807) % 2147483647
      pts.push({ x: 10 + (i / 60_000) * 380, y: 100 + Math.sin(i / 900) * 60 + ((seed / 2147483647) - 0.5) * 40 })
    }
    const reduced = m4Pixels(pts)
    expect(reduced.length).toBeLessThan(380 * 8 + 8)
    const a = pixels(pts)
    const b = pixels(reduced)
    // The FOOTPRINT is the claim: every pixel the full line covers (at more
    // than a faint antialiased fringe) the reduced line covers too, and
    // nothing else. Measured: 0 either way. Antialiasing SHADE along the
    // dense zigzag does differ (~10% of painted pixels by more than 32/255
    // alpha) — the full path overlaps itself hundreds of times per column.
    let onlyFull = 0
    let onlyReduced = 0
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3]! > 128 && b[i + 3]! === 0) onlyFull++
      if (b[i + 3]! > 128 && a[i + 3]! === 0) onlyReduced++
    }
    expect(onlyFull).toBe(0)
    expect(onlyReduced).toBe(0)
  })

  it('returns sparse, empty and non-monotone input untouched', () => {
    const sparse = [{ x: 0, y: 0 }, { x: 50, y: 1 }, { x: 100, y: 2 }]
    expect(m4Pixels(sparse)).toBe(sparse)
    const back: Pt[] = Array.from({ length: 1000 }, (_, i) => ({ x: i % 2 === 0 ? i / 100 : 0, y: i }))
    expect(m4Pixels(back)).toBe(back)
  })
})
