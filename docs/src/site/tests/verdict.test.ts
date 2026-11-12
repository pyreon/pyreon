import { describe, expect, it } from 'vitest'
import { barWidths, formatMeasure, normalizeVerdict, verdictLabel } from '../kit/verdict'

describe('verdict mapping', () => {
  it('labels every verdict with text (never colour alone)', () => {
    expect(['win', 'tie', 'split', 'loss', 'info'].map(verdictLabel)).toEqual(['win', 'tie', 'split', 'loss', 'measured'])
  })

  it('turns an unknown verdict into "measured", never a win', () => {
    expect(normalizeVerdict('winner')).toBe('info')
    expect(verdictLabel('')).toBe('measured')
  })

  it('formats sub-millisecond ms as µs and keeps units', () => {
    expect(formatMeasure(0.13, 'ms')).toBe('130 µs')
    expect(formatMeasure(72.64, 'ms')).toBe('72.64 ms')
    expect(formatMeasure(1407, 'ns')).toBe('1,407 ns')
    expect(formatMeasure(4, '')).toBe('4')
  })

  it('scales bars to the larger value with a visible minimum', () => {
    expect(barWidths(50, 100)).toEqual({ pyreon: 50, rival: 100 })
    expect(barWidths(0.001, 100).pyreon).toBe(2)
    expect(barWidths(0, 0)).toEqual({ pyreon: 2, rival: 2 })
  })
})
