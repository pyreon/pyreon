import { afterEach, describe, expect, it } from 'vitest'
import {
  adjustForAncestor,
  calcDropdownHorizontal,
  calcDropdownVertical,
  calcModalPos,
} from '../Overlay/positioning'

const rect = (top: number, left: number, width: number, height: number): DOMRect => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({ top, left, width, height }),
})

describe('positioning helpers — browser path (happy-dom)', () => {
  it('calcDropdownVertical: fits below → positions under the trigger', () => {
    const trigger = rect(100, 200, 80, 30) // top=100
    const content = rect(0, 0, 60, 40)
    const result = calcDropdownVertical(content, trigger, 'bottom', 'left', 0, 4)
    expect(result.resolvedAlignY).toBe('bottom')
    expect(result.pos.top).toBe(trigger.bottom + 4)
  })

  it('calcDropdownHorizontal: flips to right when left does not fit', () => {
    const trigger = rect(100, 10, 80, 30) // near left edge
    const content = rect(0, 0, 120, 40) // wider than trigger.left
    const result = calcDropdownHorizontal(content, trigger, 'left', 'top', 0, 0)
    expect(result.resolvedAlignX).toBe('right')
  })

  it('calcModalPos: centers horizontally and vertically', () => {
    const content = rect(0, 0, 400, 300)
    const pos = calcModalPos(content, 'center', 'center', 0, 0)
    expect(typeof pos.left).toBe('number')
    expect(typeof pos.top).toBe('number')
  })

  it('adjustForAncestor: subtracts ancestor offset from absolute positions', () => {
    const adjusted = adjustForAncestor({ top: 100, left: 200 }, { top: 30, left: 50 })
    expect(adjusted.top).toBe(70)
    expect(adjusted.left).toBe(150)
  })

  it('adjustForAncestor: returns input unchanged when ancestor is origin', () => {
    const input = { top: 10, left: 20 }
    expect(adjustForAncestor(input, { top: 0, left: 0 })).toBe(input)
  })
})

// SSR-fallback path: the positioning helpers are only reachable via mounted
// event handlers in production, so `typeof window === 'undefined'` never
// fires in browser tests. We force the fallback by stubbing `globalThis.window`
// to `undefined` for the duration of a single test. happy-dom resets on
// teardown; we restore the original window afterwards.
describe('positioning helpers — SSR fallback (window undefined)', () => {
  const realWindow = globalThis.window
  const realWindowDesc = Object.getOwnPropertyDescriptor(globalThis, 'window')

  afterEach(() => {
    if (realWindowDesc) Object.defineProperty(globalThis, 'window', realWindowDesc)
    else (globalThis as { window?: unknown }).window = realWindow
  })

  it('calcDropdownVertical returns alignment-preserving empty fallback', () => {
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true, writable: true })
    const result = calcDropdownVertical(rect(0, 0, 60, 40), rect(100, 200, 80, 30), 'bottom', 'left', 0, 0)
    expect(result.pos).toEqual({})
    expect(result.resolvedAlignX).toBe('left')
    expect(result.resolvedAlignY).toBe('bottom')
  })

  it('calcDropdownHorizontal returns alignment-preserving empty fallback', () => {
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true, writable: true })
    const result = calcDropdownHorizontal(rect(0, 0, 60, 40), rect(100, 200, 80, 30), 'right', 'top', 0, 0)
    expect(result.pos).toEqual({})
    expect(result.resolvedAlignX).toBe('right')
    expect(result.resolvedAlignY).toBe('top')
  })

  it('calcModalPos returns empty object', () => {
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true, writable: true })
    expect(calcModalPos(rect(0, 0, 400, 300), 'center', 'center', 0, 0)).toEqual({})
  })
})
