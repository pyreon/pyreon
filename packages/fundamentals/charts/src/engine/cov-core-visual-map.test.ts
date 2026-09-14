// visualMap's READING arms: the numeric coercion that accepts a numeric
// STRING and rejects a non-finite one, the data-extent walk over the shapes a
// series datum can take, the piece label/colour fallbacks, and the placement
// keywords. Each spec pairs the input an arm acts on with one it must not
// touch, so a lost arm changes an assertion rather than only a percentage.
import { describe, expect, it } from 'vitest'
import { domainFromSeries, renderVisualMap, visualMapCommands, visualMapSpec } from './visual-map'

const SERIES = [{ type: 'heatmap', data: [[0, 0, 2], [1, 0, 9]] }]
const vm = (v: Record<string, unknown>, series: unknown = SERIES) => visualMapSpec({ visualMap: v, series })!

describe('numeric coercion — a numeric STRING is a number, everything else is absent', () => {
  it('accepts a numeric string for min/max/itemWidth/itemHeight/fontSize and ignores junk', () => {
    const s = vm({ min: '2', max: '8', itemWidth: '20', itemHeight: '50', textStyle: { fontSize: '13' } }).spec
    expect(s.domain).toEqual([2, 8])
    expect(s.itemSize).toBe(20)
    expect(s.itemLength).toBe(50)
    expect(s.fontSize).toBe(13)
    // Junk / non-finite / blank fall back to the derived domain and the defaults.
    const junk = vm({ min: 'abc', max: Number.NaN, itemWidth: '   ', itemHeight: Number.POSITIVE_INFINITY, textStyle: { fontSize: {} } }).spec
    expect(junk.domain).toEqual([2, 9]) // from the data
    expect(junk.itemSize).toBe(16)
    expect(junk.itemLength).toBe(120)
    expect(junk.fontSize).toBe(11)
  })

  it('a MISSING min/max falls back to the data extent, then to 0..1 when there is no data either', () => {
    expect(vm({}).spec.domain).toEqual([2, 9])
    // Only one end pinned: the other still comes from the data.
    expect(vm({ min: 0 }).spec.domain).toEqual([0, 9])
    expect(vm({ max: 100 }).spec.domain).toEqual([2, 100])
    // No readable series at all.
    expect(vm({}, []).spec.domain).toEqual([0, 1])
  })
})

describe('domainFromSeries — the datum shapes a heat/map series can carry', () => {
  it('reads the LAST element of an array datum, `value` (scalar or array) of an object, and a bare number', () => {
    expect(domainFromSeries({ series: [{ data: [[0, 0, 5], [1, 1, 12]] }] })).toEqual([5, 12])
    expect(domainFromSeries({ series: [{ data: [{ value: 3 }, { value: 8 }] }] })).toEqual([3, 8])
    expect(domainFromSeries({ series: [{ data: [{ value: [0, 0, 4] }, { value: [1, 1, 6] }] }] })).toEqual([4, 6])
    expect(domainFromSeries({ series: [{ data: [7, 1] }] })).toEqual([1, 7])
  })

  it('takes the FIRST series from an array and reads a bare series object just the same', () => {
    expect(domainFromSeries({ series: [{ data: [1, 4] }, { data: [100] }] })).toEqual([1, 4])
    expect(domainFromSeries({ series: { data: [2, 6] } })).toEqual([2, 6])
  })

  it('skips an unreadable datum, and answers null when nothing numeric is left', () => {
    // A `null` and a string datum are skipped; the numbers around them still count.
    expect(domainFromSeries({ series: [{ data: [3, null, 'x', 9] }] })).toEqual([3, 9])
    expect(domainFromSeries({ series: [{ data: ['a', null] }] })).toBeNull()
    expect(domainFromSeries({ series: [{ data: [] }] })).toBeNull()
    // Not a series / no data array at all.
    expect(domainFromSeries({ series: 'nope' })).toBeNull()
    expect(domainFromSeries({ series: [{ type: 'heatmap' }] })).toBeNull()
    expect(domainFromSeries({})).toBeNull()
  })
})

describe('spec reading', () => {
  it('takes the FIRST entry when visualMap is an array', () => {
    const r = visualMapSpec({ visualMap: [{ min: 1, max: 2 }, { min: 50, max: 60 }], series: SERIES })!
    expect(r.spec.domain).toEqual([1, 2])
  })

  it('a stop list shorter than two colours falls back to the built-in ramp', () => {
    expect(vm({ inRange: { color: ['#ff0000'] } }).spec.stops.length).toBeGreaterThanOrEqual(2)
    expect(vm({ inRange: { color: ['#ff0000', '#00ff00'] } }).spec.stops).toEqual(['#ff0000', '#00ff00'])
    // A non-string entry is filtered out before the length test.
    expect(vm({ inRange: { color: ['#ff0000', 7] } }).spec.stops.length).toBeGreaterThan(2)
  })

  it('a `text` that is not a two-entry array is ignored, so the strip labels with the domain', () => {
    expect(vm({ text: ['hi'] }).spec.text).toBeUndefined()
    expect(vm({ text: 'hi' }).spec.text).toBeUndefined()
    expect(vm({ text: [1, 2] }).spec.text).toEqual(['1', '2'])
  })
})

describe('piecewise pieces — every label and colour fallback', () => {
  it('labels an open-ended piece by its bound, honours gte/gt and lte/lt, and numbers a bound-less one', () => {
    const s = vm({
      type: 'piecewise',
      pieces: [
        { gte: 8 }, //           lower bound only  → "≥ 8"
        { gt: 5, lt: 8 }, //     both, via gt/lt   → "5 – 8"
        { lte: 5 }, //           upper bound only  → "≤ 5"
        {}, //                   neither           → its 1-based position
        'not an object', //      skipped entirely
      ],
    }).spec
    expect(s.pieces.map((p) => p.label)).toEqual(['≥ 8', '5 – 8', '≤ 5', '4'])
    expect(s.pieces[0]!.min).toBe(8)
    expect(s.pieces[0]!.max).toBeUndefined()
    expect(s.pieces[2]!.max).toBe(5)
    expect(s.pieces[2]!.min).toBeUndefined()
    expect(s.pieces[3]!.min).toBeUndefined()
    expect(s.pieces[3]!.max).toBeUndefined()
  })

  it('a piece with no colour takes one from the ramp, high piece first; an explicit colour wins', () => {
    const s = vm({ type: 'piecewise', pieces: [{ min: 5 }, { max: 5, color: '#abcdef' }] }).spec
    expect(s.pieces[1]!.color).toBe('#abcdef')
    expect(s.pieces[0]!.color).toMatch(/^#|^rgb/)
    expect(s.pieces[0]!.color).not.toBe(s.pieces[1]!.color)
    // A SINGLE piece cannot interpolate — it takes the ramp's top, not NaN.
    const one = vm({ type: 'piecewise', pieces: [{ min: 0 }] }).spec
    expect(one.pieces[0]!.color).toMatch(/^#|^rgb/)
    expect(one.pieces[0]!.color).not.toContain('NaN')
  })

  it('a SINGLE category and a splitNumber of one both take the ramp top rather than dividing by zero', () => {
    const cat = vm({ type: 'piecewise', categories: ['only'] }).spec
    expect(cat.pieces).toHaveLength(1)
    expect(cat.pieces[0]!.color).not.toContain('NaN')
    const one = vm({ type: 'piecewise', splitNumber: 1, min: 0, max: 10 }).spec
    expect(one.pieces).toHaveLength(1)
    expect(one.pieces[0]!.label).toBe('0 – 10')
    expect(one.pieces[0]!.color).not.toContain('NaN')
  })

  it('splitNumber defaults to 5, floors a fraction and never drops below one band', () => {
    expect(vm({ type: 'piecewise', min: 0, max: 10 }).spec.pieces).toHaveLength(5)
    expect(vm({ type: 'piecewise', splitNumber: 3.9, min: 0, max: 9 }).spec.pieces).toHaveLength(3)
    expect(vm({ type: 'piecewise', splitNumber: 0, min: 0, max: 10 }).spec.pieces).toHaveLength(1)
    expect(vm({ type: 'piecewise', splitNumber: -4, min: 0, max: 10 }).spec.pieces).toHaveLength(1)
  })
})

describe('placement — the keywords, the percentage and the fallbacks', () => {
  const heat = { visualMap: { min: 0, max: 10, orient: 'horizontal' }, series: SERIES }
  const at = (place: Record<string, unknown>) => visualMapCommands({ ...heat, visualMap: { ...heat.visualMap, ...place } }, 400, 300).box!

  it('left/top pin to the origin, right/bottom to the far edge, center/middle to the middle', () => {
    const probe = at({ left: 0, top: 0 })
    expect(at({ left: 'left' }).x).toBe(0)
    expect(at({ top: 'top' }).y).toBe(0)
    expect(at({ left: 'right' }).x).toBeCloseTo(400 - probe.w, 9)
    expect(at({ top: 'bottom' }).y).toBeCloseTo(300 - probe.h, 9)
    expect(at({ left: 'center' }).x).toBeCloseTo((400 - probe.w) / 2, 9)
    expect(at({ top: 'middle' }).y).toBeCloseTo((300 - probe.h) / 2, 9)
  })

  it('a percentage is a fraction of the axis; a numeric string is pixels', () => {
    expect(at({ left: '25%' }).x).toBeCloseTo(100, 9)
    expect(at({ top: '10%' }).y).toBeCloseTo(30, 9)
    expect(at({ left: '37' }).x).toBeCloseTo(37, 9)
  })

  it('an unreadable placement falls back to the default corner rather than to NaN', () => {
    const fallback = at({ left: 'nonsense', top: 'nonsense' })
    const def = at({})
    expect(fallback.x).toBe(def.x)
    expect(fallback.y).toBeCloseTo(def.y, 9)
    expect(Number.isNaN(fallback.x)).toBe(false)
    // A percentage whose number does not parse is unreadable too …
    expect(at({ left: 'x%' }).x).toBe(def.x)
    // … while a bare '%' parses as 0% and really does pin to the origin.
    expect(at({ left: '%' }).x).toBe(0)
    // And a non-string, non-number placement is simply absent.
    expect(at({ left: { nope: true } }).x).toBe(def.x)
  })

  it('`right`/`bottom` anchor the far edge when `left`/`top` are absent', () => {
    const probe = at({ left: 0, top: 0 })
    expect(at({ right: 10 }).x).toBeCloseTo(400 - 10 - probe.w, 9)
    expect(at({ bottom: 20 }).y).toBeCloseTo(300 - 20 - probe.h, 9)
  })
})

describe('render — the piecewise row width follows the LABELS', () => {
  it('a vertical piecewise strip is as wide as its widest label, and as tall as its swatches', () => {
    const spec = vm({ type: 'piecewise', pieces: [{ min: 0, max: 1, label: 'x' }, { min: 1, max: 2, label: 'a much longer label' }] }).spec
    const v = renderVisualMap(spec, { x: 0, y: 0 })
    const narrow = renderVisualMap({ ...spec, pieces: [spec.pieces[0]!] }, { x: 0, y: 0 })
    expect(v.width).toBeGreaterThan(narrow.width)
    expect(v.height).toBeGreaterThan(narrow.height)
    // An empty piece list reports no height rather than a negative one.
    expect(renderVisualMap({ ...spec, pieces: [] }, { x: 0, y: 0 }).height).toBe(0)
    expect(renderVisualMap({ ...spec, pieces: [], orient: 'horizontal' }, { x: 0, y: 0 }).width).toBe(0)
  })
})
