import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

describe('OptionChart family routing (real browser)', () => {
  it('a pie option mounts the PieChart host on canvas, forwards its hit tagged with the kind, and swaps hosts on option change', async () => {
    const option = signal<EChartsOption>({ series: [{ type: 'pie', data: [{ name: 'x', value: 1 }, { name: 'y', value: 3 }] }] })
    const seen: [string, unknown][] = []
    const { container } = mountInBrowser(h(OptionChart, { option: () => option(), width: 300, height: 200, onFamilySelect: (kind: string, hit: unknown) => seen.push([kind, hit]) }))
    await flush()
    // The host canvas is live; OptionChart's own canvas is hidden and no svg fallback was used.
    const canvases = Array.from(container.querySelectorAll('canvas'))
    expect(canvases).toHaveLength(2)
    expect(container.querySelector('svg')).toBeNull()
    const live = canvases.find((c) => c.style.display !== 'none')!
    const r = live.getBoundingClientRect()
    live.dispatchEvent(new MouseEvent('click', { clientX: r.left + 150 + 40, clientY: r.top + 100, bubbles: true }))
    expect(seen).toHaveLength(1)
    expect(seen[0]![0]).toBe('pie')
    expect(typeof seen[0]![1]).toBe('number')
    option.set({ series: [{ type: 'treemap', data: [{ name: 'r', children: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] }] }] })
    await flush()
    expect(container.querySelector('table')!.textContent).toContain('a')
    // Back to a cartesian option: the host goes away and the built-in canvas paints.
    option.set({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    await flush()
    expect(Array.from(container.querySelectorAll('canvas')).filter((c) => c.style.display !== 'none')).toHaveLength(1)
  })
})
