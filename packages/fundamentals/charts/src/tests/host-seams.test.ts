import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { hostPropsFor } from '../engine/OptionChart'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('OptionChart forwards host props REACTIVELY', () => {
  // `<OptionChart width={w()} />` arrives as a getter (the compiler emits
  // `_rp(() => …)`, `makeReactiveProps` installs it). `hostPropsFor` runs once at
  // setup, so reading the prop there pins it forever — and the host reads
  // `width`/`height`/`title`/`rtl` lazily, so they would otherwise be live.
  const withGetter = (key: string, read: () => unknown): Record<string, unknown> => {
    const p: Record<string, unknown> = {}
    Object.defineProperty(p, key, { get: read, enumerable: true, configurable: true })
    return p
  }

  it('a getter-backed prop is still live after hostPropsFor', () => {
    let w = 100
    const out = hostPropsFor(withGetter('width', () => w) as never) as Record<string, unknown>
    // A GETTER, so it reads transparently — `canvasHost` takes a plain object,
    // not component props, so nothing would convert a thunk for it.
    expect(out.width).toBe(100)
    w = 900
    expect(out.width, 'a value copy would pin this at 100').toBe(900)
    expect(typeof out.width, 'must not be a raw thunk — the host reads it directly').toBe('number')
  })

  it('an ABSENT prop stays absent so the host defaults apply', () => {
    const out = hostPropsFor({} as never) as Record<string, unknown>
    expect('rtl' in out, 'presence is static per call site; only the value is deferred').toBe(false)
  })

  it('height still defaults when absent', () => {
    const out = hostPropsFor({} as never) as Record<string, unknown>
    expect(out.height).toBe(320)
  })
})

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
