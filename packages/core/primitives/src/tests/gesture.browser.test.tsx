// <Gesture> + transform props in real Chromium.
//
// What happy-dom cannot settle: that a transform prop becomes a real COMPUTED
// transform matrix and moves the element's box, and that `touch-action: none`
// reaches the cascade. (The child-click half of the capture rule — capture is
// taken only once a gesture is claimed — needs a REAL pointer sequence; a
// dispatched PointerEvent does not produce the browser's own click, so it is
// not asserted here rather than asserted by something that would pass anyway.)

import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Gesture, Stack, Text } from '../index'
import type { PanEvent } from '../types/gesture'

const pointer = (el: Element, type: string, id: number, x: number, y: number) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      pointerId: id,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      isPrimary: id === 1,
      pointerType: 'touch',
    }),
  )

describe('transform props — web', () => {
  it('lower to a real computed transform that moves the box, and update in place', async () => {
    const x = signal(0)
    const props = { padding: 2 }
    Object.defineProperty(props, 'translateX', { get: () => x(), enumerable: true })
    const { container, unmount } = mountInBrowser(h(Stack, props, h(Text, null, 'moved')))
    const el = container.firstElementChild as HTMLElement
    await flush()
    const left0 = el.getBoundingClientRect().left
    x.set(50)
    await flush()
    expect(getComputedStyle(el).transform).toBe('matrix(1, 0, 0, 1, 50, 0)')
    expect(el.getBoundingClientRect().left - left0).toBeCloseTo(50, 0)
    expect(container.firstElementChild).toBe(el)
    unmount()
  })

  it('scale and rotate compose in the fixed order', async () => {
    const { container, unmount } = mountInBrowser(
      h(Stack, { scale: 2, rotate: 90 }, h(Text, null, 'x')),
    )
    const m = new DOMMatrix(getComputedStyle(container.firstElementChild as Element).transform)
    // scale(2) rotate(90deg): a = cos·2 ≈ 0, b = sin·2 = 2.
    expect(m.a).toBeCloseTo(0, 5)
    expect(m.b).toBeCloseTo(2, 5)
    unmount()
  })
})

describe('<Gesture> — web', () => {
  it('reports a drag with cumulative translation in element coordinates', async () => {
    const pans: PanEvent[] = []
    const { container, unmount } = mountInBrowser(
      h(Gesture, { onPan: (e: PanEvent) => pans.push(e) }, h(Stack, { padding: 9 }, h(Text, null, 'area'))),
    )
    const el = container.firstElementChild as HTMLElement
    expect(getComputedStyle(el).touchAction).toBe('none')
    const r = el.getBoundingClientRect()
    pointer(el, 'pointerdown', 1, r.left + 5, r.top + 5)
    pointer(el, 'pointermove', 1, r.left + 30, r.top + 5)
    pointer(el, 'pointermove', 1, r.left + 30, r.top + 25)
    pointer(el, 'pointerup', 1, r.left + 30, r.top + 25)
    expect(pans.map((e) => e.phase)).toEqual(['start', 'change', 'end'])
    expect(pans.at(-1)).toMatchObject({ dx: 25, dy: 20, x: 30, y: 25 })
    unmount()
  })
})
