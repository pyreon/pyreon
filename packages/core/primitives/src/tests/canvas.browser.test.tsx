// <Canvas> in real Chromium: the shapes are genuine SVG geometry (not inert
// unknown elements), laid over one another inside the canvas box, and clipped.

import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Canvas, CanvasCircle, CanvasPath, CanvasRect, CanvasText } from '../index'

describe('<Canvas> — web', () => {
  it('draws real SVG geometry at canvas coordinates', () => {
    const { container, unmount } = mountInBrowser(
      h(
        Canvas,
        { width: 200, height: 100 },
        h(CanvasRect, { x: 20, y: 10, width: 50, height: 30, fill: 'primary' }),
        h(CanvasCircle, { cx: 150, cy: 50, r: 10 }),
        h(CanvasPath, { d: 'M0 0 L200 100', stroke: 'text' }),
        h(CanvasText, { x: 5, y: 60 }, 'Hall'),
      ),
    )
    const canvas = container.firstElementChild as HTMLElement
    const box = canvas.getBoundingClientRect()
    expect(box.width).toBe(200)
    expect(box.height).toBe(100)
    expect(getComputedStyle(canvas).overflow).toBe('hidden')

    const rect = canvas.querySelector('rect') as SVGRectElement
    expect(rect).toBeInstanceOf(SVGRectElement)
    const r = rect.getBoundingClientRect()
    expect(r.left - box.left).toBeCloseTo(20, 0)
    expect(r.top - box.top).toBeCloseTo(10, 0)
    expect(r.width).toBeCloseTo(50, 0)

    const path = canvas.querySelector('path') as SVGPathElement
    expect(path).toBeInstanceOf(SVGPathElement)
    expect(path.getTotalLength()).toBeCloseTo(Math.hypot(200, 100), 0)

    const text = canvas.querySelector('text') as SVGTextElement
    expect(text.getBoundingClientRect().top - box.top).toBeGreaterThanOrEqual(59)
    // Every layer fills the canvas, so shapes share one coordinate space.
    for (const svg of canvas.querySelectorAll('svg')) {
      expect(svg.getBoundingClientRect().width).toBe(200)
    }
    unmount()
  })
})
