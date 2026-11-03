// <Canvas> + shape primitives — happy-dom unit coverage of the web impl:
// DOM shape (one <svg> layer per shape), the paint defaults the native emits
// share, and that signal-driven props update the SAME element in place.

import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Canvas, CanvasCircle, CanvasLine, CanvasPath, CanvasRect, CanvasText } from '../index'
import { shapeColor, shapePaint } from '../web/Canvas'

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

function mountCanvas(...children: ReturnType<typeof h>[]): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(h(Canvas, { width: 200, height: 100, background: 'surface', 'data-testid': 'c' }, ...children), container)
  cleanup = () => {
    dispose()
    container.remove()
  }
  return container.firstElementChild as HTMLElement
}

const getter = <T,>(obj: Record<string, unknown>, key: string, read: () => T) => {
  Object.defineProperty(obj, key, { get: read, enumerable: true })
  return obj
}

describe('paint rules', () => {
  it('tokens resolve, hex passes through', () => {
    expect(shapeColor('primary')).toBe('#2563eb')
    expect(shapeColor('#abc')).toBe('#abc')
  })

  it('no paint fills with text; a stroke alone leaves the fill empty and defaults width 1', () => {
    expect(shapePaint({})).toEqual({ fill: '#111827', stroke: 'none', width: 0 })
    expect(shapePaint({ stroke: 'danger' })).toEqual({ fill: 'none', stroke: '#dc2626', width: 1 })
    expect(shapePaint({ fill: 'primary', stroke: '#000', strokeWidth: 3 })).toEqual({
      fill: '#2563eb',
      stroke: '#000',
      width: 3,
    })
  })
})

describe('<Canvas> web', () => {
  it('a sized, clipped, relative box with passthrough attrs', () => {
    const el = mountCanvas()
    expect(el.style.width).toBe('200px')
    expect(el.style.height).toBe('100px')
    expect(el.style.position).toBe('relative')
    expect(el.style.overflow).toBe('hidden')
    expect(el.style.background).toBe('#ffffff')
    expect(el.getAttribute('data-testid')).toBe('c')
  })

  it('each shape is its own absolutely positioned svg layer, in source order', () => {
    const el = mountCanvas(
      h(CanvasRect, { x: 1, y: 2, width: 30, height: 40, radius: 5, fill: 'primary' }),
      h(CanvasCircle, { cx: 50, cy: 50, r: 10, stroke: 'danger' }),
      h(CanvasLine, { x1: 0, y1: 0, x2: 10, y2: 10 }),
      h(CanvasPath, { d: 'M0 0 L5 5', stroke: '#123456', strokeWidth: 2 }),
      h(CanvasText, { x: 4, y: 6 }, 'label'),
    )
    const layers = [...el.children] as SVGElement[]
    expect(layers.map((l) => l.tagName.toLowerCase())).toEqual(['svg', 'svg', 'svg', 'svg', 'svg'])
    expect(layers.every((l) => l.namespaceURI === 'http://www.w3.org/2000/svg')).toBe(true)
    expect(layers[0]!.style.position).toBe('absolute')
    expect(layers[0]!.style.pointerEvents).toBe('none')
    const rect = layers[0]!.firstElementChild!
    expect(rect.tagName.toLowerCase()).toBe('rect')
    expect(rect.getAttribute('rx')).toBe('5')
    expect(rect.getAttribute('fill')).toBe('#2563eb')
    const circle = layers[1]!.firstElementChild!
    expect(circle.getAttribute('fill')).toBe('none')
    expect(circle.getAttribute('stroke')).toBe('#dc2626')
    expect(circle.getAttribute('stroke-width')).toBe('1')
    const line = layers[2]!.firstElementChild!
    expect(line.getAttribute('stroke')).toBe('#111827')
    expect(line.getAttribute('stroke-width')).toBe('1')
    const path = layers[3]!.firstElementChild!
    expect(path.getAttribute('d')).toBe('M0 0 L5 5')
    expect(path.getAttribute('stroke-width')).toBe('2')
    const text = layers[4]!.firstElementChild!
    expect(text.getAttribute('dominant-baseline')).toBe('hanging')
    expect(text.getAttribute('font-size')).toBe('14')
    expect(text.getAttribute('fill')).toBe('#111827')
    expect(text.textContent).toBe('label')
  })

  it('rect radius defaults to 0, line/text honour their own colour + size', () => {
    const el = mountCanvas(
      h(CanvasRect, { x: 0, y: 0, width: 1, height: 1 }),
      h(CanvasLine, { x1: 0, y1: 0, x2: 1, y2: 1, stroke: 'muted', strokeWidth: 4 }),
      h(CanvasText, { x: 0, y: 0, size: 20, fill: 'primary' }, 't'),
    )
    const [rect, line, text] = [...el.children].map((l) => l.firstElementChild!)
    expect(rect!.getAttribute('rx')).toBe('0')
    expect(line!.getAttribute('stroke')).toBe('#9ca3af')
    expect(line!.getAttribute('stroke-width')).toBe('4')
    expect(text!.getAttribute('font-size')).toBe('20')
    expect(text!.getAttribute('fill')).toBe('#2563eb')
  })

  it('a signal-driven prop updates the same element in place', () => {
    const d = signal('M0 0 L1 1')
    const w = signal(10)
    const pathProps = getter({ stroke: 'text' }, 'd', () => d())
    const rectProps = getter({ x: 0, y: 0, height: 5 }, 'width', () => w())
    const el = mountCanvas(h(CanvasPath, pathProps), h(CanvasRect, rectProps))
    const path = el.children[0]!.firstElementChild!
    const rect = el.children[1]!.firstElementChild!
    d.set('M0 0 L9 9')
    w.set(42)
    expect(path.getAttribute('d')).toBe('M0 0 L9 9')
    expect(rect.getAttribute('width')).toBe('42')
    expect(el.children[0]!.firstElementChild).toBe(path)
  })

  it('a canvas with no background has none', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(h(Canvas, { width: 5, height: 5 }), container)
    expect((container.firstElementChild as HTMLElement).style.background).toBe('')
    dispose()
    container.remove()
  })

  it('transform props reach the canvas box', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(h(Canvas, { width: 5, height: 5, rotate: 10 }), container)
    expect((container.firstElementChild as HTMLElement).style.transform).toBe('rotate(10deg)')
    dispose()
    container.remove()
  })
})
