import { describe, expect, it } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

/**
 * The compiled option's states on the shared host: the hovered datum is the
 * highlight (it takes `emphasis.itemStyle.color`, the others blur under
 * `emphasis.focus`), and a click pins per the option's `selectedMode`
 * (`select.itemStyle.color`, a heavy outline). Asserted on the commands the
 * host paints, through a recording 2D context.
 */
function recordingContext(): { ctx: CanvasRenderingContext2D; fills: () => string[]; reset: () => void } {
  let fills: string[] = []
  const target: Record<string | symbol, unknown> = {}
  const ctx = new Proxy(target, {
    get: (t, k) => {
      if (k === 'measureText') return (text: string) => ({ width: text.length * 6 })
      if (k === 'fillRect' || k === 'fill') return () => { fills.push(String(t['fillStyle'])) }
      return k in t ? t[k] : () => undefined
    },
    set: (t, k, v) => { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, fills: () => fills, reset: () => { fills = [] } }
}

const OPTION: EChartsOption = {
  xAxis: { type: 'category', data: ['a', 'b', 'c'] },
  yAxis: {},
  series: [{ type: 'bar', data: [3, 5, 2], itemStyle: { color: '#111111' }, selectedMode: 'multiple', emphasis: { focus: 'self', itemStyle: { color: '#ee0000' } }, select: { itemStyle: { color: '#0000ee' } }, blur: { itemStyle: { opacity: 0.5 } } }],
}

describe('OptionChart states', () => {
  it('hover highlights the datum under the pointer and blurs the others; a click pins it per selectedMode', () => {
    const rec = recordingContext()
    const prevGet = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => rec.ctx) as unknown as HTMLCanvasElement['getContext']
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(<OptionChart option={OPTION} width={300} height={200} />, root)
    try {
      const canvas = query<HTMLCanvasElement>(root, 'canvas')
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
      const bars = () => rec.fills().filter((f) => f === '#111111' || f === '#ee0000' || f === '#0000ee' || f.startsWith('rgba(17, 17, 17'))
      expect(bars()).toEqual(['#111111', '#111111', '#111111'])

      // Hover the middle bar: it takes the emphasis colour, the others blur.
      rec.reset()
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 105, bubbles: true }))
      expect(bars()).toEqual(['rgba(17, 17, 17, 0.5)', '#ee0000', 'rgba(17, 17, 17, 0.5)'])

      // Click it: pinned (select colour) even after the pointer leaves.
      rec.reset()
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 105, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 105, bubbles: true }))
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 105, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
      expect(bars().slice(-3)).toEqual(['#111111', '#0000ee', '#111111'])

      // `multiple`: a second click pins another; clicking a pinned datum unpins it.
      rec.reset()
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 82, clientY: 105, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
      expect(bars().slice(-3)).toEqual(['#0000ee', '#0000ee', '#111111'])
      rec.reset()
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 105, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
      expect(bars().slice(-3)).toEqual(['#0000ee', '#111111', '#111111'])
    } finally {
      dispose()
      root.remove()
      HTMLCanvasElement.prototype.getContext = prevGet
    }
  })

  it('without selectedMode a click reports the pick but pins nothing', () => {
    const rec = recordingContext()
    const prevGet = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => rec.ctx) as unknown as HTMLCanvasElement['getContext']
    const root = document.createElement('div')
    document.body.appendChild(root)
    const picks: number[] = []
    const { selectedMode: _m, ...plain } = (OPTION['series'] as Record<string, unknown>[])[0]!
    const dispose = mount(<OptionChart option={{ ...OPTION, series: [plain] }} width={300} height={200} onSelectIndex={(i) => picks.push(i)} />, root)
    try {
      const canvas = query<HTMLCanvasElement>(root, 'canvas')
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
      rec.reset()
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 120, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
      expect(picks).toEqual([1])
      expect(rec.fills().filter((f) => f === '#0000ee')).toEqual([])
    } finally {
      dispose()
      root.remove()
      HTMLCanvasElement.prototype.getContext = prevGet
    }
  })
})
