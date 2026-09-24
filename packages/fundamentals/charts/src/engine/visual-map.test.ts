import { describe, expect, it } from 'vitest'
import { HEAT_RAMP } from './heat'
import { renderVisualMap, visualMap, visualSelectionOptions } from './visual-map'

describe('visualMap() — every option defaulted', () => {
  it('a bare domain is a continuous vertical ramp over the heat colours, the whole domain selected', () => {
    const s = visualMap({ domain: [0, 10] })
    expect(s.type).toBe('continuous')
    expect(s.orient).toBe('vertical')
    expect(s.stops).toEqual(HEAT_RAMP)
    expect(s.range).toEqual([0, 10])
    expect(s.pieces).toEqual([])
    expect(s.calculable).toBe(false)
    expect(s.itemSize).toBe(16)
    expect(s.itemLength).toBe(120)
  })

  it('a stop list shorter than two colours falls back to the heat ramp; two or more are kept', () => {
    expect(visualMap({ domain: [0, 1], stops: ['#000'] }).stops).toEqual(HEAT_RAMP)
    expect(visualMap({ domain: [0, 1], stops: ['#000', '#fff'] }).stops).toEqual(['#000', '#fff'])
  })

  it('orders a reversed range low to high', () => {
    expect(visualMap({ domain: [0, 100], range: [80, 20] }).range).toEqual([20, 80])
  })

  it('handles are only for a continuous strip', () => {
    expect(visualMap({ domain: [0, 1], calculable: true }).calculable).toBe(true)
    expect(visualMap({ domain: [0, 1], type: 'piecewise', calculable: true }).calculable).toBe(false)
  })
})

describe('visualMap() — piecewise', () => {
  it('without pieces splits the domain into splitNumber bands, high first', () => {
    const s = visualMap({ domain: [0, 10], type: 'piecewise', splitNumber: 2 })
    expect(s.pieces.map((p) => [p.min, p.max, p.label])).toEqual([[5, 10, '5 – 10'], [0, 5, '0 – 5']])
    expect(s.selected).toEqual([true, true])
    expect(s.itemSize).toBe(14)
  })

  it('splitNumber defaults to 5 and never drops below one band', () => {
    expect(visualMap({ domain: [0, 10], type: 'piecewise' }).pieces).toHaveLength(5)
    expect(visualMap({ domain: [0, 10], type: 'piecewise', splitNumber: 0 }).pieces).toHaveLength(1)
  })

  it('labels a piece by its bounds when it has no label, and numbers a bound-less one', () => {
    const s = visualMap({ domain: [0, 10], type: 'piecewise', pieces: [{ min: 5 }, { max: 2 }, { min: 2, max: 5 }, {}, { label: 'own' }] })
    expect(s.pieces.map((p) => p.label)).toEqual(['≥ 5', '≤ 2', '2 – 5', '4', 'own'])
  })

  it('a piece without a colour takes the ramp, high piece first; an explicit colour wins', () => {
    const s = visualMap({ domain: [0, 1], type: 'piecewise', stops: ['#000000', '#ffffff'], pieces: [{ min: 1 }, { max: 0, color: '#ff0000' }] })
    expect(s.pieces[0]!.color).toBe('rgb(255, 255, 255)')
    expect(s.pieces[1]!.color).toBe('#ff0000')
  })

  it('selected is by piece index, absent entries on', () => {
    const s = visualMap({ domain: [0, 10], type: 'piecewise', splitNumber: 3, selected: [true, false] })
    expect(s.selected).toEqual([true, false, true])
    expect(visualSelectionOptions(s).outBands).toBeDefined()
  })
})

describe('render — the piecewise row width follows the LABELS', () => {
  it('a vertical piecewise strip is as wide as its widest label, and as tall as its swatches', () => {
    const spec = visualMap({ domain: [0, 2], type: 'piecewise', pieces: [{ min: 0, max: 1, label: 'x' }, { min: 1, max: 2, label: 'a much longer label' }] })
    const v = renderVisualMap(spec, { x: 0, y: 0 })
    const narrow = renderVisualMap({ ...spec, pieces: [spec.pieces[0]!] }, { x: 0, y: 0 })
    expect(v.width).toBeGreaterThan(narrow.width)
    expect(v.height).toBeGreaterThan(narrow.height)
    // An empty piece list reports no height rather than a negative one.
    expect(renderVisualMap({ ...spec, pieces: [] }, { x: 0, y: 0 }).height).toBe(0)
    expect(renderVisualMap({ ...spec, pieces: [], orient: 'horizontal' }, { x: 0, y: 0 }).width).toBe(0)
  })
})
