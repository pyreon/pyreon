import { describe, expect, it } from 'vitest'
import { autoLabelStyle, colorLum, isHexColor, labelCommands, labelLineSegments, labelPlace } from './labels'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6

describe('labelLineSegments — a tag broken after its bar', () => {
  it('a `{` inside a barred tag keeps the consumed name|body as literal text', () => {
    // `{a|b` is reopened by `{`, so the first run is literal and the second `{` is unterminated.
    const out = labelLineSegments('{a|b{', [], '#000', 12)
    expect(out.map((s) => s.text).join('')).toBe('{a|b{')
  })
  it('a rich style with an empty colour or a zero size inherits that part from the label', () => {
    const out = labelLineSegments('{k|x}{m|y}', [{ name: 'k', color: '', fontSize: 20 }, { name: 'm', color: '#f00', fontSize: 0 }], '#000', 12)
    expect(out).toEqual([{ text: 'x', color: '#000', fontSize: 20 }, { text: 'y', color: '#f00', fontSize: 12 }])
  })
})

describe('labelCommands — halo width', () => {
  it('a stroke with no width defaults to 2; an explicit width is kept', () => {
    const [d] = labelCommands('x', [], { x: 0, y: 0 }, 'start', 'top', '#000', 12, measure, '#fff') as (DrawCmd & { strokeWidth?: number })[]
    expect(d!.strokeWidth).toBe(2)
    const [e] = labelCommands('x', [], { x: 0, y: 0 }, 'start', 'top', '#000', 12, measure, '#fff', 4) as (DrawCmd & { strokeWidth?: number })[]
    expect(e!.strokeWidth).toBe(4)
  })
})

describe('labelPlace — every named position', () => {
  const r = { x: 10, y: 20, w: 100, h: 40 }
  const cases: [string, number, number, string, string, boolean][] = [
    ['left', 5, 40, 'end', 'middle', false],
    ['right', 115, 40, 'start', 'middle', false],
    ['top', 60, 15, 'middle', 'bottom', false],
    ['bottom', 60, 65, 'middle', 'top', false],
    ['insideLeft', 15, 40, 'start', 'middle', true],
    ['insideRight', 105, 40, 'end', 'middle', true],
    ['insideTop', 60, 25, 'middle', 'top', true],
    ['insideBottom', 60, 55, 'middle', 'bottom', true],
    ['insideTopLeft', 15, 25, 'start', 'top', true],
    ['insideTopRight', 105, 25, 'end', 'top', true],
    ['insideBottomLeft', 15, 55, 'start', 'bottom', true],
    ['insideBottomRight', 105, 55, 'end', 'bottom', true],
    ['nonsense', 60, 40, 'middle', 'middle', true],
  ]
  for (const [pos, x, y, align, baseline, inside] of cases) {
    it(`${pos} anchors at (${x}, ${y})`, () => {
      expect(labelPlace(r, pos, 5)).toEqual({ at: { x, y }, align, baseline, inside })
    })
  }
  it('a negative-size rect (a downward bar) is normalised before placing', () => {
    const neg = { x: 110, y: 60, w: -100, h: -40 }
    expect(labelPlace(neg, 'insideTopLeft', 5)).toEqual(labelPlace(r, 'insideTopLeft', 5))
    expect(labelPlace(neg, 'top', 5)).toEqual(labelPlace(r, 'top', 5))
  })
})

describe('colorLum / isHexColor — non-hex input', () => {
  it('anything that is not #rgb/#rrggbb reads as mid lightness', () => {
    expect(colorLum('red')).toBe(0.3)
    expect(colorLum('rgb(0,0,0)')).toBe(0.3)
    expect(colorLum('#ffffff')).toBe(1)
    // The right length but no leading #.
    expect(colorLum('abcd')).toBe(0.3)
    expect(colorLum('abcdefg')).toBe(0.3)
  })
  it('a 7- or 4-char string without a leading # is not a hex colour', () => {
    expect(isHexColor('abcdefg')).toBe(false)
    expect(isHexColor('abcd')).toBe(false)
    expect(isHexColor('#abc')).toBe(true)
  })
})

describe('autoLabelStyle — outside labels', () => {
  it('a light hex background: dark text haloed in the background', () => {
    expect(autoLabelStyle(false, '#000000', '#ffffff')).toEqual({ textFill: '#333', halo: '#ffffff' })
  })
  it('a dark hex background: light text haloed in the background', () => {
    expect(autoLabelStyle(false, '#000000', '#101010')).toEqual({ textFill: '#ccc', halo: '#101010' })
  })
  it('no hex background: dark text on a white halo', () => {
    expect(autoLabelStyle(false, '#000000', 'transparent')).toEqual({ textFill: '#333', halo: '#ffffff' })
  })
  it('inside a mid fill on a dark chart: a light label, no halo (lightness does not match the mode)', () => {
    // #606060 is mid (~0.38) → '#eee', a light label; the chart is dark → no halo.
    expect(autoLabelStyle(true, '#606060', '#101010')).toEqual({ textFill: '#eee', halo: '' })
  })
  it('inside a light fill on a dark chart: a dark label haloed in the shape colour', () => {
    expect(autoLabelStyle(true, '#808080', '#101010')).toEqual({ textFill: '#333', halo: '#808080' })
  })
})
