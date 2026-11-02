// <Gesture> + the transform props — happy-dom unit coverage.
//
// The state machine (`GestureTracker`) is asserted directly: it is the part
// whose contract the Android runtime mirrors, so its phases, slop and
// re-anchoring are pinned here number by number. The component tests then
// prove the pointer-event wiring reaches it. Real-pointer + computed-style
// behaviour is in `gesture.browser.test.tsx`.

import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Gesture, Stack, Text } from '../index'
import type { PanEvent, PinchEvent, RotateEvent } from '../types/gesture'
import { GESTURE_SLOP, GestureTracker } from '../web/gesture-tracker'
import { mergePassthroughStyle, transformCss } from '../web/passthrough'

function collect() {
  const pan: PanEvent[] = []
  const pinch: PinchEvent[] = []
  const rotate: RotateEvent[] = []
  return {
    pan,
    pinch,
    rotate,
    handlers: {
      onPan: (e: PanEvent) => pan.push(e),
      onPinch: (e: PinchEvent) => pinch.push(e),
      onRotate: (e: RotateEvent) => rotate.push(e),
    },
  }
}

describe('GestureTracker', () => {
  it('reports nothing until the pointer passes the slop', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    expect(t.update([{ x: 0, y: 0 }])).toBe(false)
    expect(t.update([{ x: GESTURE_SLOP, y: 0 }])).toBe(false)
    expect(c.pan).toEqual([])
    expect(t.claimed).toBe(false)
    expect(t.update([{ x: GESTURE_SLOP + 1, y: 0 }])).toBe(true)
    expect(t.claimed).toBe(true)
    expect(c.pan).toEqual([{ dx: GESTURE_SLOP + 1, dy: 0, x: GESTURE_SLOP + 1, y: 0, phase: 'start' }])
  })

  it('pan: one start, cumulative changes, one end carrying the last values', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: 5, y: 5 }])
    t.update([{ x: 25, y: 5 }])
    t.update([{ x: 25, y: 35 }])
    t.update([])
    expect(c.pan.map((e) => e.phase)).toEqual(['start', 'change', 'end'])
    expect(c.pan[1]).toEqual({ dx: 20, dy: 30, x: 25, y: 35, phase: 'change' })
    expect(c.pan[2]).toEqual({ dx: 20, dy: 30, x: 25, y: 35, phase: 'end' })
    // A single pointer never pinches or rotates.
    expect(c.pinch).toEqual([])
    expect(c.rotate).toEqual([])
  })

  it('resets between gestures — the next one starts from zero', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: 0, y: 0 }])
    t.update([{ x: 40, y: 0 }])
    t.finish()
    t.update([{ x: 100, y: 100 }])
    t.update([{ x: 100, y: 150 }])
    expect(c.pan.at(-1)).toEqual({ dx: 0, dy: 50, x: 100, y: 150, phase: 'start' })
  })

  it('pinch: scale is the cumulative distance ratio, anchored at the start centroid', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: 100, y: 100 }, { x: 200, y: 100 }])
    t.update([{ x: 50, y: 100 }, { x: 250, y: 100 }]) // distance 100 → 200
    t.update([{ x: 0, y: 100 }, { x: 300, y: 100 }]) // → 300
    t.finish()
    expect(c.pinch.map((e) => e.phase)).toEqual(['start', 'change', 'end'])
    expect(c.pinch[0]!.scale).toBeCloseTo(2)
    expect(c.pinch[1]!.scale).toBeCloseTo(3)
    expect(c.pinch[1]!.centerX).toBe(150)
    expect(c.pinch[1]!.centerY).toBe(100)
    expect(c.pinch[2]!.scale).toBeCloseTo(3)
  })

  it('rotate: degrees accumulate, clockwise positive, across the ±180 seam', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    // Pointer b sits left of a at angle 180; swing it to just past -180.
    t.update([{ x: 0, y: 0 }, { x: -100, y: 0 }])
    t.update([{ x: 0, y: 0 }, { x: -100, y: -20 }])
    expect(c.rotate.length).toBe(1)
    // atan2 goes from 180 to about -168.7; the seam must read as +11.3, not -348.7.
    expect(c.rotate[0]!.degrees).toBeCloseTo(11.31, 1)
    t.update([{ x: 0, y: 0 }, { x: -100, y: 0 }])
    expect(c.rotate[1]!.degrees).toBeCloseTo(0, 5)
    // Turning the other way across the seam reads as negative.
    t.update([{ x: 0, y: 0 }, { x: -100, y: 20 }])
    expect(c.rotate[2]!.degrees).toBeCloseTo(-11.31, 1)
  })

  it('a pure two-finger rotation (no pan, no zoom) still passes the slop', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: -50, y: 0 }, { x: 50, y: 0 }])
    // 30 degrees about the centre at radius 50: arc ≈ 26 > slop.
    const r = (30 * Math.PI) / 180
    t.update([
      { x: -50 * Math.cos(r), y: -50 * Math.sin(r) },
      { x: 50 * Math.cos(r), y: 50 * Math.sin(r) },
    ])
    expect(c.rotate[0]?.phase).toBe('start')
    expect(c.rotate[0]!.degrees).toBeCloseTo(30)
  })

  it('re-anchors when a finger lands or lifts, so values do not jump', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: 0, y: 0 }])
    t.update([{ x: 30, y: 0 }])
    // A second finger lands far away: the centroid leaps, but that is not a pan.
    t.update([{ x: 30, y: 0 }, { x: 330, y: 0 }])
    expect(c.pan.at(-1)!.dx).toBe(30)
    t.update([{ x: 40, y: 0 }, { x: 340, y: 0 }])
    expect(c.pan.at(-1)!.dx).toBe(40)
    // It lifts: again a re-anchor, no jump back.
    t.update([{ x: 40, y: 0 }])
    t.update([{ x: 45, y: 0 }])
    expect(c.pan.at(-1)!.dx).toBe(45)
  })

  it('only calls the handlers that are present, read at event time', () => {
    const pans: PanEvent[] = []
    let handlers: { onPan?: (e: PanEvent) => void } = {}
    const t = new GestureTracker(() => handlers)
    t.update([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    t.update([{ x: 0, y: 0 }, { x: 100, y: 0 }]) // claimed; no handlers yet
    expect(t.claimed).toBe(true)
    handlers = { onPan: (e) => pans.push(e) }
    t.update([{ x: 10, y: 0 }, { x: 110, y: 0 }])
    expect(pans).toHaveLength(1)
    t.finish()
    expect(pans.at(-1)!.phase).toBe('end')
  })

  it('finish() before any gesture delivers no end', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: 0, y: 0 }])
    t.finish()
    expect(c.pan).toEqual([])
  })

  it('an empty update finishes the gesture', () => {
    const c = collect()
    const t = new GestureTracker(() => c.handlers)
    t.update([{ x: 0, y: 0 }])
    t.update([{ x: 50, y: 0 }])
    expect(t.update([])).toBe(false)
    expect(c.pan.at(-1)!.phase).toBe('end')
  })
})

describe('transform props on the web', () => {
  it('transformCss orders rotate→scale→translate and omits what is absent', () => {
    expect(transformCss({})).toBeUndefined()
    expect(transformCss({ translateX: 4 })).toBe('translate(4px, 0px)')
    expect(transformCss({ translateY: -2 })).toBe('translate(0px, -2px)')
    expect(transformCss({ translateX: 1, translateY: 2, scale: 3, rotate: 45 })).toBe(
      'translate(1px, 2px) scale(3) rotate(45deg)',
    )
  })

  it('mergePassthroughStyle stays STATIC when no transform prop is present', () => {
    expect(mergePassthroughStyle({ a: '1' }, {})).toEqual({ a: '1' })
    expect(mergePassthroughStyle({ a: '1' }, { style: 'b: 2' })).toBe('a: 1; b: 2')
  })

  it('becomes an accessor (and wins over a consumer transform) when one is present', () => {
    const out = mergePassthroughStyle({ a: '1' }, { style: { transform: 'none' }, scale: 2 })
    expect(typeof out).toBe('function')
    expect((out as () => unknown)()).toEqual({ a: '1', transform: 'scale(2)' })
    const str = mergePassthroughStyle({ a: '1' }, { style: 'b: 2', rotate: 90 }) as () => unknown
    expect(str()).toBe('a: 1; b: 2; transform: rotate(90deg)')
  })

  it('a present-but-undefined transform prop yields the plain merged style', () => {
    // The compiler-emitted shape: a getter that can resolve to undefined.
    const props = {}
    Object.defineProperty(props, 'scale', { get: () => undefined, enumerable: true })
    const out = mergePassthroughStyle({ a: '1' }, props) as () => unknown
    expect(out()).toEqual({ a: '1' })
  })

  it('a reactive transform prop updates the element in place', () => {
    const s = signal(1)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const props = {}
    Object.defineProperty(props, 'scale', { get: () => s(), enumerable: true })
    const dispose = mount(h(Stack, props, h(Text, null, 'x')), container)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.transform).toBe('scale(1)')
    s.set(2.5)
    expect(el.style.transform).toBe('scale(2.5)')
    expect(container.firstElementChild).toBe(el)
    dispose()
    container.remove()
  })
})

describe('<Gesture> happy-dom wiring', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function mountGesture(props: Record<string, unknown>) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(h(Gesture, props, h('span', null, 'content')), container)
    cleanup = () => {
      dispose()
      container.remove()
    }
    return container.firstElementChild as HTMLElement
  }

  const fire = (el: Element, type: string, id: number, x: number, y: number) => {
    const ev = new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    return ev
  }

  it('renders a touch-action:none div with its children and passthrough attrs', () => {
    const el = mountGesture({ 'data-testid': 'g', onPan: () => {} })
    expect(el.tagName).toBe('DIV')
    expect(el.style.touchAction).toBe('none')
    expect(el.getAttribute('data-testid')).toBe('g')
    expect(el.textContent).toBe('content')
  })

  it('a drag delivers start / change / end in element coordinates', () => {
    const c = collect()
    const el = mountGesture({ onPan: c.handlers.onPan })
    fire(el, 'pointerdown', 1, 10, 10)
    fire(el, 'pointermove', 1, 40, 10)
    const ev = fire(el, 'pointermove', 1, 40, 50)
    expect(ev.defaultPrevented).toBe(true)
    fire(el, 'pointerup', 1, 40, 50)
    expect(c.pan.map((e) => e.phase)).toEqual(['start', 'change', 'end'])
    expect(c.pan[1]).toMatchObject({ dx: 30, dy: 40 })
  })

  it('a two-pointer spread pinches', () => {
    const c = collect()
    const el = mountGesture({ onPinch: c.handlers.onPinch, onRotate: c.handlers.onRotate })
    fire(el, 'pointerdown', 1, 100, 100)
    fire(el, 'pointerdown', 2, 200, 100)
    fire(el, 'pointermove', 2, 300, 100)
    fire(el, 'pointercancel', 2, 300, 100)
    fire(el, 'pointerup', 1, 100, 100)
    expect(c.pinch[0]!.scale).toBeCloseTo(2)
    expect(c.pinch.at(-1)!.phase).toBe('end')
    expect(c.rotate[0]!.degrees).toBeCloseTo(0)
  })

  it('ignores moves and ups from pointers it never saw', () => {
    const c = collect()
    const el = mountGesture({ onPan: c.handlers.onPan })
    fire(el, 'pointermove', 9, 50, 50)
    fire(el, 'pointerup', 9, 50, 50)
    expect(c.pan).toEqual([])
  })

  it('a pointer leaving before the slop is dropped; after the claim it is kept', () => {
    const c = collect()
    const el = mountGesture({ onPan: c.handlers.onPan })
    fire(el, 'pointerdown', 1, 0, 0)
    fire(el, 'pointerleave', 1, 2, 0)
    fire(el, 'pointermove', 1, 80, 0)
    expect(c.pan).toEqual([])
    fire(el, 'pointerdown', 2, 0, 0)
    fire(el, 'pointermove', 2, 50, 0)
    fire(el, 'pointerleave', 2, 60, 0)
    fire(el, 'pointermove', 2, 70, 0)
    expect(c.pan.at(-1)).toMatchObject({ dx: 70, phase: 'change' })
  })
})
