import { describe, expect, it } from 'vitest'
import { presetHit, presetIsActive, presetWindow, renderPresets } from './presets'
import type { PresetOptions, ZoomPreset } from './presets'
import type { DrawCmd } from './types'

const measure = (t: string, size: number): number => t.length * size * 0.6

const OPTS: PresetOptions = {
  fontSize: 10.0,
  padX: 5.0,
  padY: 3.0,
  gap: 6.0,
  inset: 8.0,
  activeFill: '#111',
  idleFill: '#eee',
  activeText: '#fff',
  idleText: '#333',
}

const ITEMS: ZoomPreset[] = [
  { label: 'ab', count: 2 },
  { label: 'abcd', count: 0 },
]

describe('presetWindow — what a preset selects', () => {
  it('a positive count is the trailing fraction of the rows', () => {
    expect(presetWindow(2, 4)).toEqual({ start: 0.5, end: 1.0 })
    expect(presetWindow(1, 4)).toEqual({ start: 0.75, end: 1.0 })
  })
  it('zero, a count covering every row, and an empty data set are all the full window', () => {
    expect(presetWindow(0, 4)).toEqual({ start: 0.0, end: 1.0 })
    expect(presetWindow(4, 4)).toEqual({ start: 0.0, end: 1.0 })
    expect(presetWindow(9, 4)).toEqual({ start: 0.0, end: 1.0 })
    expect(presetWindow(3, 0)).toEqual({ start: 0.0, end: 1.0 })
  })
  it('is NOT clamped to the minimum span — the last row of a hundred stays one row', () => {
    const w = presetWindow(1, 100)
    expect(w.start).toBeCloseTo(0.99, 9)
    expect(w.end).toBe(1.0)
  })
})

describe('presetIsActive — the highlight rule', () => {
  it('matches its own window within tolerance and nothing else', () => {
    expect(presetIsActive(ITEMS[0]!, 4, { start: 0.5, end: 1.0 })).toBe(true)
    expect(presetIsActive(ITEMS[0]!, 4, { start: 0.5000000001, end: 1.0 })).toBe(true)
    expect(presetIsActive(ITEMS[0]!, 4, { start: 0.5, end: 0.9 })).toBe(false)
    expect(presetIsActive(ITEMS[0]!, 4, { start: 0.25, end: 1.0 })).toBe(false)
  })
  it('the "all" preset is active exactly on the full window', () => {
    expect(presetIsActive(ITEMS[1]!, 4, { start: 0.0, end: 1.0 })).toBe(true)
    expect(presetIsActive(ITEMS[1]!, 4, { start: 0.5, end: 1.0 })).toBe(false)
  })
})

describe('renderPresets — the strip', () => {
  // The whole canvas: the strip takes its bottom 22 units.
  const box = { x: 0.0, y: 0.0, w: 300.0, h: 200.0 }

  it('lays the buttons out right-aligned, in order, with the configured gaps and insets', () => {
    const l = renderPresets(ITEMS, 4, { start: 0.0, end: 1.0 }, box, OPTS, measure)
    // widths: 'ab' → 2*10*0.6 + 10 = 22; 'abcd' → 4*10*0.6 + 10 = 34; span = 22 + 6 + 34 = 62
    expect(l.boxes).toEqual([
      { x: 300 - 8 - 62, y: 181, w: 22, h: 16 },
      { x: 300 - 8 - 62 + 22 + 6, y: 181, w: 34, h: 16 },
    ])
    expect(l.boxes[1]!.x + l.boxes[1]!.w).toBe(300 - 8)
    expect(l.height).toBe(22)
  })

  it('fills the active preset and mutes the rest; the label sits at the button centre', () => {
    const l = renderPresets(ITEMS, 4, { start: 0.5, end: 1.0 }, box, OPTS, measure)
    const rects = l.cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')
    const texts = l.cmds.filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')
    expect(rects.map((r) => r.fill)).toEqual(['#111', '#eee'])
    expect(texts.map((t) => t.fill)).toEqual(['#fff', '#333'])
    expect(texts.map((t) => t.text)).toEqual(['ab', 'abcd'])
    expect(texts[0]!.at).toEqual({ x: l.boxes[0]!.x + 11, y: 181 + 8 })
    expect(texts[0]!.align).toBe('middle')
    expect(texts[0]!.baseline).toBe('middle')
    expect(texts[0]!.size).toBe(10.0)
  })

  it('no presets → nothing drawn, nothing to hit', () => {
    const l = renderPresets([], 4, { start: 0.0, end: 1.0 }, box, OPTS, measure)
    expect(l.cmds).toEqual([])
    expect(l.boxes).toEqual([])
    expect(l.height).toBe(0)
  })
})

describe('presetHit — the click / tap', () => {
  const boxes = renderPresets(ITEMS, 4, { start: 0.0, end: 1.0 }, { x: 0.0, y: 0.0, w: 300.0, h: 200.0 }, OPTS, measure).boxes

  it('reports the button under the point, edges inclusive', () => {
    const b0 = boxes[0]!
    expect(presetHit(boxes, b0.x + b0.w / 2, b0.y + b0.h / 2)).toBe(0)
    expect(presetHit(boxes, b0.x, b0.y)).toBe(0)
    expect(presetHit(boxes, b0.x + b0.w, b0.y + b0.h)).toBe(0)
    const b1 = boxes[1]!
    expect(presetHit(boxes, b1.x + 1, b1.y + 1)).toBe(1)
  })

  it('misses the gap between buttons, the plot above the strip, and an empty box list', () => {
    const b0 = boxes[0]!
    expect(presetHit(boxes, b0.x + b0.w + 3, b0.y + 4)).toBe(-1)
    expect(presetHit(boxes, b0.x + 4, b0.y - 20)).toBe(-1)
    expect(presetHit([], 10, 10)).toBe(-1)
  })
})
