import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import type { ECharts } from 'echarts/core'
import { afterEach, describe, expect, it } from 'vitest'
import { Chart } from '../chart-component'
import type { ChartEventParams } from '../types'

// Real-Chromium coverage for the general event map (`onEvents`), the
// leak-safe listener lifecycle, and the reactive `showLoading` overlay.
// ECharts events fire on canvas rendering / instance actions — none of
// this is observable under happy-dom, so these are browser-only.

afterEach(() => {
  document.body.innerHTML = ''
})

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<boolean> => {
  const start = Date.now()
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise<void>((r) => setTimeout(r, 25))
  }
  return predicate()
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('charts — onEvents + showLoading', () => {
  it('onEvents binds an ARBITRARY ECharts event (legendselectchanged), not just the 3 shorthands', async () => {
    let received: ChartEventParams | null = null
    let inst: ECharts | null = null
    const options = () => ({
      legend: {},
      series: [
        {
          type: 'pie' as const,
          data: [
            { value: 1, name: 'A' },
            { value: 2, name: 'B' },
          ],
        },
      ],
    })
    const { unmount } = mountInBrowser(
      h(Chart, {
        options,
        style: 'width:300px;height:220px',
        onInit: (i: ECharts) => {
          inst = i
        },
        onEvents: {
          legendselectchanged: (p: ChartEventParams) => {
            received = p
          },
        },
      }),
    )
    const ready = await waitFor(() => inst !== null, 5000)
    expect(ready).toBe(true)
    // Deterministically trigger the event via the instance action API.
    inst!.dispatchAction({ type: 'legendToggleSelect', name: 'A' })
    const fired = await waitFor(() => received !== null, 2000)
    expect(fired).toBe(true)
    expect(received!.name).toBe('A')
    unmount()
  })

  it('onEvents handler receives the live ECharts instance as its 2nd argument', async () => {
    let handlerInstance: unknown = null
    let inst: ECharts | null = null
    const options = () => ({
      legend: {},
      series: [{ type: 'pie' as const, data: [{ value: 1, name: 'X' }] }],
    })
    const { unmount } = mountInBrowser(
      h(Chart, {
        options,
        style: 'width:300px;height:220px',
        onInit: (i: ECharts) => {
          inst = i
        },
        onEvents: {
          legendselectchanged: (_p: ChartEventParams, instance: ECharts) => {
            handlerInstance = instance
          },
        },
      }),
    )
    await waitFor(() => inst !== null, 5000)
    inst!.dispatchAction({ type: 'legendToggleSelect', name: 'X' })
    await waitFor(() => handlerInstance !== null, 2000)
    // Same instance object the component created — proves the 2nd arg wiring.
    expect(handlerInstance).toBe(inst)
    unmount()
  })

  it('unmount removes bound listeners via inst.off (leak-safe cleanup)', async () => {
    let inst: ECharts | null = null
    const offCalls: string[] = []
    const options = () => ({
      legend: {},
      series: [{ type: 'pie' as const, data: [{ value: 1, name: 'A' }] }],
    })
    const { unmount } = mountInBrowser(
      h(Chart, {
        options,
        style: 'width:300px;height:220px',
        onInit: (i: ECharts) => {
          inst = i
        },
        onEvents: { legendselectchanged: () => {} },
        onClick: () => {},
      }),
    )
    const ready = await waitFor(() => inst !== null, 5000)
    expect(ready).toBe(true)
    // Spy on off AFTER the listeners are bound.
    const realOff = inst!.off.bind(inst)
    inst!.off = ((event: string, handler?: unknown) => {
      offCalls.push(event)
      return realOff(event, handler as never)
    }) as ECharts['off']

    unmount()
    // onCleanup ran inst.off(...) for every listener this component bound,
    // BEFORE the instance was disposed — no listener pile-up on re-mount.
    expect(offCalls).toContain('legendselectchanged')
    expect(offCalls).toContain('click')
  })

  it('showLoading toggles the ECharts loading overlay reactively', async () => {
    const show = signal(false)
    let inst: ECharts | null = null
    const calls: string[] = []
    const options = () => ({
      series: [{ type: 'bar' as const, data: [1, 2, 3] }],
      xAxis: { type: 'category' as const, data: ['a', 'b', 'c'] },
      yAxis: { type: 'value' as const },
    })
    // Pass showLoading as a getter so the effect reading `props.showLoading`
    // subscribes to `show` — the same shape the compiler produces for
    // `showLoading={show()}` in real JSX (raw h() can't wrap props reactively).
    const props: Record<string, unknown> = {
      options,
      style: 'width:300px;height:220px',
      onInit: (i: ECharts) => {
        inst = i
      },
    }
    Object.defineProperty(props, 'showLoading', {
      get: () => show(),
      enumerable: true,
      configurable: true,
    })
    const { unmount } = mountInBrowser(h(Chart, props))
    const ready = await waitFor(() => inst !== null, 5000)
    expect(ready).toBe(true)

    // Spy after init so we observe the reactive toggles specifically.
    inst!.showLoading = (() => calls.push('show')) as unknown as ECharts['showLoading']
    inst!.hideLoading = (() => calls.push('hide')) as unknown as ECharts['hideLoading']

    show.set(true)
    await sleep(50)
    expect(calls).toContain('show')

    calls.length = 0
    show.set(false)
    await sleep(50)
    expect(calls).toContain('hide')
    unmount()
  })
})
