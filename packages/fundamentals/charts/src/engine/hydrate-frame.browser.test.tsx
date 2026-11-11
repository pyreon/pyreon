// The server's first frame (`data-pyreon-chart-frame`) is removed once the
// canvas paints. In a real browser the canvas paints DURING hydration (its ref
// draws synchronously), before the frame element after it has been claimed.
// Removing that element from its own ref while the hydration walk is still on
// it left the walk with no next sibling: a mismatch, and the tooltip, live
// region and accessible table mounted a second time beside the server's.
//
// happy-dom never paints (no 2D context), so `hydrate.test.tsx` cannot see
// this; it needs real Chromium. `renderToString` cannot run in the page
// (runtime-server imports node:async_hooks), so the server-shaped markup is
// produced by a client mount whose canvas cannot paint: the frame element then
// stays, exactly where the server puts it. Its SVG content is irrelevant here.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { PlotChart } from './Chart'
import { bars } from './marks'

interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'a', v: 3 }, { m: 'b', v: 6 }, { m: 'c', v: 4 }]

const tree = () =>
  h(() => PlotChart<Row>({ data: ROWS, x: (d) => d.m, marks: [bars<Row>((d) => d.v)], title: 'T', height: 180, animate: false, tooltip: true }), null)

describe('server first frame → hydrate (real browser)', () => {
  it('adopts the server markup and drops the frame once painted, with no mismatch or duplicate', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext
    const scratch = document.createElement('div')
    document.body.appendChild(scratch)
    const unmount = mount(tree() as never, scratch)
    const html = scratch.innerHTML
    unmount()
    scratch.remove()
    HTMLCanvasElement.prototype.getContext = getContext
    expect(html, 'no first-frame element in the server-shaped markup').toContain('data-pyreon-chart-frame')
    const el = document.createElement('div')
    el.style.width = '480px'
    document.body.appendChild(el)
    el.innerHTML = html
    const canvasBefore = el.querySelector('canvas')
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, tree() as never)
    off()
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    expect(mismatches, 'hydration mismatches').toEqual([])
    expect(el.querySelector('canvas'), 'the server canvas was replaced').toBe(canvasBefore)
    expect(el.querySelectorAll('[data-pyreon-chart-tooltip]').length, 'tooltip mounted twice').toBe(1)
    expect(el.querySelectorAll('table').length, 'accessible table mounted twice').toBe(1)
    expect(el.querySelector('[data-pyreon-chart-frame]'), 'the first frame outlived the paint').toBeNull()
    cleanup()
    el.remove()
  })
})
