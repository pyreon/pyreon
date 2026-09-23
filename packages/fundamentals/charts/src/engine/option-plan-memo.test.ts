// `<OptionChart>` plans its option ONCE per change. The paint, the layout the
// pointer hit-tests and the accessible input each asked for the same plan, and
// a mount ran each twice: six full compiles of the option per mount — at
// 100,000 points, most of the gap to ECharts' first render.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const calls = { n: 0 }
vi.mock('./option', async (importOriginal) => {
  const real = await importOriginal<typeof import('./option')>()
  return {
    ...real,
    planOption: (...args: Parameters<typeof real.planOption>) => {
      calls.n++
      return real.planOption(...args)
    },
  }
})

beforeAll(() => {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
})

const OPTION = (data: number[]) => ({ animation: false, xAxis: { type: 'category', data: data.map(String) }, yAxis: { type: 'value' }, series: [{ type: 'line', data }] })

describe('<OptionChart> plans an option once', () => {
  it('a mount plans the option one time', async () => {
    const { OptionChart } = await import('./OptionChart')
    const root = document.createElement('div')
    document.body.appendChild(root)
    calls.n = 0
    const un = mount(h(OptionChart, { option: OPTION([1, 2, 3]) as never, width: 400, height: 240 }), root)
    expect(calls.n).toBe(1)
    un()
    root.remove()
  })

  it('a new option object plans again, once', async () => {
    const { OptionChart } = await import('./OptionChart')
    const root = document.createElement('div')
    document.body.appendChild(root)
    const opt = signal(OPTION([1, 2, 3]))
    const un = mount(h(OptionChart, { option: (() => opt()) as never, width: 400, height: 240 }), root)
    calls.n = 0
    opt.set(OPTION([3, 2, 1]))
    expect(calls.n).toBe(1)
    un()
    root.remove()
  })
})
