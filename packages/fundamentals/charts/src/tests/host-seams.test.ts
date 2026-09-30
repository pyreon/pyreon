import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'


const HERE = dirname(fileURLToPath(import.meta.url))

describe('every canvas-host paint goes through the presentation transform', () => {
  // The RTL mirror is the last step before pixels. `canvasHost` has TWO paint
  // paths — `draw()` (full layout) and `paintCached()` (the tween tick, arrow
  // keys, Escape, blur) — and only the first applied it, so an RTL chart
  // un-mirrored on every cached repaint and the tween SETTLED unmirrored while
  // the pointer seam kept mirroring.
  //
  // A behavioural test would need real pixels; the invariant is structural and
  // is what actually failed: a paint call that forgets `present`.
  it('no paint( call bypasses present(', () => {
    const src = readFileSync(join(HERE, '..', 'engine', 'canvas-host.tsx'), 'utf8')
    const calls = src.split('\n').filter((l) => /(?<![A-Za-z_$])paint\(/.test(l) && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
    expect(calls.length, 'expected to find the paint call sites at all').toBeGreaterThan(1)
    const bypass = calls.filter((l) => !l.includes('present('))
    expect(
      bypass.map((l) => l.trim()),
      'every paint( must apply present( — that is what makes an RTL chart RTL',
    ).toEqual([])
  })
})
