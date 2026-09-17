// Pattern fills are a paint kind of the SVG serializer. Both are always-reachable arms of `chartToSvg` — the one
// entry a node-side consumer imports — so an unasserted arm is uncovered
// output, not dead code. `patternSvg` is private, driven here through
// `collectPatterns`, which is the surface a backend composing its own document
// actually calls.
import { describe, expect, it } from 'vitest'
import { collectPatterns, svgCommand } from './svg'
import type { ChartPattern, DrawCmd } from './types'

const rect = (extra: Partial<Extract<DrawCmd, { kind: 'rect' }>> = {}): DrawCmd => ({
  kind: 'rect',
  rect: { x: 0, y: 0, w: 10, h: 20 },
  fill: '#123456',
  ...extra,
})

const pattern = (over: Partial<ChartPattern> = {}): ChartPattern => ({
  kind: 'diagonal',
  color: '#fff',
  spacing: 6,
  width: 1,
  ...over,
})

describe('collectPatterns — one <pattern> def per pattern-bearing command', () => {
  it('mints an id only for commands that carry a pattern, and an empty slot otherwise', () => {
    const cmds: DrawCmd[] = [
      rect(),
      rect({ pattern: pattern() }),
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 1, fill: '#000' },
      { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], fill: '#000', pattern: pattern({ kind: 'dots' }) },
    ]
    const { defs, ids } = collectPatterns(cmds, 'p')
    // Ids are positional: every command gets a slot so the caller can index by
    // command, and a slot is '' when that command has no pattern.
    expect(ids).toEqual(['', 'p-p0', '', 'p-p1'])
    expect(defs.startsWith('<defs>')).toBe(true)
    expect(defs).toContain('<pattern id="p-p0"')
    expect(defs).toContain('<pattern id="p-p1"')
  })

  it('emits no <defs> at all when nothing carries a pattern', () => {
    const { defs, ids } = collectPatterns([rect()], 'p')
    expect(defs).toBe('')
    expect(ids).toEqual([''])
  })

  it('each pattern tile is the shape box holding the engine marks: dots as circles, a diagonal as one stripe direction, a cross as two', () => {
    const dots = collectPatterns([rect({ pattern: pattern({ kind: 'dots', spacing: 8, width: 2 }) })], 'p').defs
    expect(dots).toContain('<circle ')
    expect(dots).toContain('r="1"')
    const slope = (defs: string): Set<string> => {
      const out = new Set<string>()
      for (const m of defs.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)) {
        const dx = Number(m[3]) - Number(m[1])
        const dy = Number(m[4]) - Number(m[2])
        out.add((Math.round((dy / dx) * 100) / 100).toString())
      }
      return out
    }
    expect([...slope(collectPatterns([rect({ pattern: pattern({ kind: 'diagonal' }) })], 'p').defs)]).toEqual(['-1'])
    expect([...slope(collectPatterns([rect({ pattern: pattern({ kind: 'cross' }) })], 'p').defs)].sort()).toEqual(['-1', '1'])
  })

  it('clamps spacing to a 2-unit minimum and width to 0.5 — a 0 would paint nothing', () => {
    const { defs } = collectPatterns([rect({ pattern: pattern({ kind: 'dots', spacing: 0, width: 0 }) })], 'p')
    expect(defs).toContain('r="0.25"')
    const xs = [...defs.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)"/g)].filter((m) => m[2] === [...defs.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)"/g)][0]![2]).map((m) => Number(m[1]))
    expect(xs[1]! - xs[0]!).toBeCloseTo(2, 6)
  })

  it('escapes the pattern colour rather than interpolating it raw', () => {
    const { defs } = collectPatterns([rect({ pattern: pattern({ color: '"><script>' }) })], 'p')
    expect(defs).not.toContain('<script>')
    expect(defs).toContain('&quot;')
  })
})

describe('svgCommand — a pattern paints OVER the ordinary fill', () => {
  it('a patterned rect emits the solid shape then the same shape filled by the pattern', () => {
    const out = svgCommand(rect({ pattern: pattern() }), 'Inter', undefined, 'p-p0')
    expect(out.match(/<rect /g)).toHaveLength(2)
    expect(out).toContain('fill="#123456"')
    expect(out).toContain('fill="url(#p-p0)"')
  })

  it('a patterned ROUNDED rect takes the path arm and overlays the same path', () => {
    const out = svgCommand(rect({ corners: [4, 4, 4, 4], pattern: pattern() }), 'Inter', undefined, 'p-p0')
    expect(out.match(/<path /g)).toHaveLength(2)
    expect(out).toContain('fill="url(#p-p0)"')
  })

  it('a patterned polygon overlays the same points', () => {
    const cmd: DrawCmd = {
      kind: 'polygon',
      points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }],
      fill: '#000',
      pattern: pattern(),
    }
    const out = svgCommand(cmd, 'Inter', undefined, 'p-p0')
    expect(out.match(/<polygon /g)).toHaveLength(2)
  })

  it('no patternId means no overlay, even when the command carries a pattern', () => {
    // The caller did not mint an id for this command — a single solid shape is
    // the correct degradation, not a `url(#undefined)` reference.
    expect(svgCommand(rect({ pattern: pattern() }), 'Inter').match(/<rect /g)).toHaveLength(1)
    expect(svgCommand(rect({ pattern: pattern() }), 'Inter', undefined, '').match(/<rect /g)).toHaveLength(1)
  })

  it('a gradient id still wins the base fill while the pattern overlays it', () => {
    const cmd = rect({
      grad: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, stops: [{ offset: 0, color: '#000' }], radial: false },
      pattern: pattern(),
    })
    const out = svgCommand(cmd, 'Inter', 'g-g0', 'p-p0')
    expect(out).toContain('fill="url(#g-g0)"')
    expect(out).toContain('fill="url(#p-p0)"')
  })
})

describe('collectPatterns — image patterns', () => {
  it('tiles an <image> per cell: a fill image at its tile size, an image decal on its grid', () => {
    const fill: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: 40, h: 20 }, fill: '#000', pattern: { kind: 'image', color: '', spacing: 0, width: 20, spacingY: 20, image: 'a.png', repeat: 'repeat' } }
    const decal: DrawCmd = { kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 }, fill: '#000', pattern: { kind: 'image', color: '', spacing: 10, spacingY: 10, width: 4, image: 'b"<.png', repeat: 'grid' } }
    const { defs } = collectPatterns([fill, decal], 'c')
    expect(defs.match(/href="a\.png"/g)?.length).toBe(2)
    expect(defs).toContain('<image href="b&quot;&lt;.png" x="3" y="3" width="4" height="4"')
  })
})

