/**
 * ECharts' `title.link`: a click on a linked title opens it, and the pointer
 * shows the title can be clicked — in real Chromium, through <OptionChart>.
 */
import { describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const option: EChartsOption = {
  animation: false,
  title: { text: 'Revenue report', link: 'https://example.test/report', target: 'self' },
  xAxis: { type: 'category', data: ['a', 'b'] },
  yAxis: {},
  series: [{ type: 'bar', data: [1, 2] }],
}

const at = (c: HTMLCanvasElement, type: string, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 3 }))
}

describe('<OptionChart> title link (real browser)', () => {
  it('opens the link from a click on the title, and shows a pointer over it', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = mountInBrowser(h(OptionChart, { option, width: 400, height: 300 }))
    await flush()
    const c = query(container, 'canvas')
    // The title's line: centred on 200, from 20 to 38.
    at(c, 'pointermove', 200, 29)
    await flush()
    expect(c.style.cursor).toBe('pointer')
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 200, clientY: r.top + 29 }))
    await flush()
    expect(open).toHaveBeenCalledWith('https://example.test/report', '_self')
    // Off the title nothing opens.
    open.mockClear()
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 10, clientY: r.top + 5 }))
    await flush()
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
