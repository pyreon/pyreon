// Unit tests for token resolution. Pure-function tests — no DOM,
// no rendering. happy-dom for vitest globals.

import { describe, expect, it } from 'vitest'
import {
  resolveAlign,
  resolveColor,
  resolveJustify,
  resolveRadius,
  resolveSpace,
} from '../web/tokens'

describe('resolveSpace', () => {
  it('integer indices map to canonical 4px scale', () => {
    // 0 still emits "0px" (uniform output keeps style strings normalized).
    expect(resolveSpace(0)).toBe('0px')
    expect(resolveSpace(1)).toBe('4px')
    expect(resolveSpace(2)).toBe('8px')
    expect(resolveSpace(3)).toBe('12px')
    expect(resolveSpace(4)).toBe('16px')
    expect(resolveSpace(9)).toBe('48px')
  })

  it('semantic names map to canonical values', () => {
    expect(resolveSpace('xs')).toBe('4px')
    expect(resolveSpace('sm')).toBe('8px')
    expect(resolveSpace('md')).toBe('12px')
    expect(resolveSpace('lg')).toBe('16px')
    expect(resolveSpace('xl')).toBe('24px')
  })
})

describe('resolveColor', () => {
  it('text → gray-900', () => {
    expect(resolveColor('text')).toBe('#111827')
  })

  it('primary → blue-600', () => {
    expect(resolveColor('primary')).toBe('#2563eb')
  })

  it('danger → red-600', () => {
    expect(resolveColor('danger')).toBe('#dc2626')
  })

  it('all token names produce valid hex', () => {
    const tokens = ['text', 'surface', 'primary', 'secondary', 'success', 'warning', 'danger', 'muted'] as const
    for (const t of tokens) {
      expect(resolveColor(t)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('resolveRadius', () => {
  it('canonical sizes', () => {
    expect(resolveRadius('none')).toBe('0')
    expect(resolveRadius('sm')).toBe('4px')
    expect(resolveRadius('md')).toBe('8px')
    expect(resolveRadius('lg')).toBe('16px')
    expect(resolveRadius('full')).toBe('9999px')
  })
})

describe('resolveAlign', () => {
  it('start/center/end map to flex equivalents', () => {
    expect(resolveAlign('start')).toBe('flex-start')
    expect(resolveAlign('center')).toBe('center')
    expect(resolveAlign('end')).toBe('flex-end')
    expect(resolveAlign('stretch')).toBe('stretch')
  })

  it('undefined input returns undefined (no inline style emitted)', () => {
    expect(resolveAlign(undefined)).toBeUndefined()
  })
})

describe('resolveJustify', () => {
  it('canonical values map to flex equivalents', () => {
    expect(resolveJustify('start')).toBe('flex-start')
    expect(resolveJustify('center')).toBe('center')
    expect(resolveJustify('end')).toBe('flex-end')
    expect(resolveJustify('between')).toBe('space-between')
    expect(resolveJustify('around')).toBe('space-around')
    expect(resolveJustify('evenly')).toBe('space-evenly')
  })

  it('undefined input returns undefined', () => {
    expect(resolveJustify(undefined)).toBeUndefined()
  })
})
