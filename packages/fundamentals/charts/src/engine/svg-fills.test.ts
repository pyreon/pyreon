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

  it('dots draw a centred circle; diagonal one stripe path; cross two', () => {
    const dots = collectPatterns([rect({ pattern: pattern({ kind: 'dots', spacing: 8, width: 2 }) })], 'p').defs
    expect(dots).toContain('<circle cx="4" cy="4" r="1"')

    const diagonal = collectPatterns([rect({ pattern: pattern({ kind: 'diagonal' }) })], 'p').defs
    expect(diagonal.match(/<path /g)).toHaveLength(1)

    const cross = collectPatterns([rect({ pattern: pattern({ kind: 'cross' }) })], 'p').defs
    expect(cross.match(/<path /g)).toHaveLength(2)
  })

  it('clamps spacing to a 2-unit minimum and width to 0.5 — a 0 would paint nothing', () => {
    const { defs } = collectPatterns([rect({ pattern: pattern({ kind: 'dots', spacing: 0, width: 0 }) })], 'p')
    expect(defs).toContain('width="2" height="2"')
    expect(defs).toContain('r="0.25"')
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
