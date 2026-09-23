import { describe, expect, it } from 'vitest'
import { renderSvg, svgCommand } from './svg'

describe('clip / unclip in the SVG serializer', () => {
  const rect = { kind: 'rect' as const, rect: { x: 0, y: 0, w: 10, h: 10 }, fill: '#f00' }

  it('a clip opens a <clipPath> and a group over what follows, closed at the unclip', () => {
    const svg = renderSvg([{ kind: 'clip', rect: { x: 1, y: 2, w: 3, h: 4 } }, rect, { kind: 'unclip' }, rect], 20, 20, { idPrefix: 'c1' })
    expect(svg).toContain('<clipPath id="c1-clip-0"><rect x="1" y="2" width="3" height="4"/></clipPath><g clip-path="url(#c1-clip-0)">')
    // The first rect is inside the group, the second after it.
    const open = svg.indexOf('<g clip-path')
    const close = svg.indexOf('</g>')
    const rects = [...svg.matchAll(/<rect x="0"/g)].map((m) => m.index!)
    expect(rects[0]! > open && rects[0]! < close).toBe(true)
    expect(rects[1]! > close).toBe(true)
  })

  it('clips nest, an unmatched unclip is ignored, and an unclosed clip still closes', () => {
    const nested = renderSvg([{ kind: 'clip', rect: { x: 0, y: 0, w: 5, h: 5 } }, { kind: 'clip', rect: { x: 0, y: 0, w: 2, h: 2 } }, rect, { kind: 'unclip' }, { kind: 'unclip' }], 20, 20)
    expect((nested.match(/<g clip-path/g) ?? []).length).toBe(2)
    expect((nested.match(/<\/g>/g) ?? []).length).toBe(2)
    expect(renderSvg([{ kind: 'unclip' }, rect], 20, 20)).not.toContain('</g>')
    const open = renderSvg([{ kind: 'clip', rect: { x: 0, y: 0, w: 5, h: 5 } }, rect], 20, 20)
    expect((open.match(/<\/g>/g) ?? []).length).toBe(1)
  })

  it('a lone command serializes a clip as nothing (the document owns the group)', () => {
    expect(svgCommand({ kind: 'clip', rect: { x: 0, y: 0, w: 1, h: 1 } }, 'sans-serif')).toBe('')
    expect(svgCommand({ kind: 'unclip' }, 'sans-serif')).toBe('')
  })
})
