// @vitest-environment node
/**
 * `defineAsyncComponent` options on the SERVER. A node environment, so
 * `isServer` is true exactly as it is in a real SSR process — the happy-dom
 * default would make every assertion here about the client instead.
 *
 * Vue's server renderer awaits every async component, suspensible or not, and
 * never runs `delay` / `timeout`; this layer does the same, on top of the
 * `__load` contract `@pyreon/runtime-server` waits on (#3715 / #3722).
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { defineAsyncComponent, Suspense } from '../index'
import { jsx } from '../jsx-runtime'

const Loaded: ComponentFn = () => h('b', { class: 'loaded' }, 'loaded')
const Loading: ComponentFn = () => h('i', { class: 'loading' }, 'loading')
const Failed: ComponentFn<{ error: Error }> = (p) => h('u', { class: 'error' }, p.error.message)

const slow = <T,>(value: T, ms = 15) => new Promise<T>((r) => setTimeout(() => r(value), ms))

const inSuspense = (child: VNodeChild) =>
  h('main', null, jsx(Suspense as unknown as ComponentFn, { fallback: h('s', null, 'fb'), children: child }))

async function read(s: ReadableStream<string>): Promise<string> {
  const r = s.getReader()
  let out = ''
  for (;;) {
    const { value, done } = await r.read()
    if (done) return out
    out += value
  }
}

describe('defineAsyncComponent options — SSR', () => {
  it('waits for a NON-suspensible component inside <Suspense> (Vue SSR awaits every async component)', async () => {
    const A = defineAsyncComponent({
      loader: () => slow({ default: Loaded }),
      loadingComponent: Loading,
      delay: 0,
      suspensible: false,
    })
    const html = await renderToString(inSuspense(h(A, {})))
    expect(html).toContain('<b class="loaded">loaded</b>')
    expect(html).not.toContain('loading')
  })

  it('waits for a bare non-suspensible component too', async () => {
    const A = defineAsyncComponent({ loader: () => slow({ default: Loaded }), suspensible: false, delay: 0, loadingComponent: Loading })
    const html = await renderToString(h('div', null, h(A, {})))
    expect(html).toContain('<b class="loaded">loaded</b>')
    expect(html).not.toContain('loading')
  })

  it('renders errorComponent for a failed load', async () => {
    const A = defineAsyncComponent({
      loader: () => slow(null).then(() => Promise.reject(new Error('ssr 500'))),
      errorComponent: Failed,
    })
    const html = await renderToString(h('div', null, h(A, {})))
    expect(html).toContain('<u class="error">ssr 500</u>')
  })

  it('runs onError retries before rendering', async () => {
    let calls = 0
    const A = defineAsyncComponent({
      loader: () => (++calls === 1 ? Promise.reject(new Error('flaky')) : slow({ default: Loaded })),
      onError: (_e, retry) => retry(),
    })
    const html = await renderToString(inSuspense(h(A, {})))
    expect(calls).toBe(2)
    expect(html).toContain('<b class="loaded">loaded</b>')
  })

  it('streams the content of a non-suspensible component', async () => {
    const A = defineAsyncComponent({ loader: () => slow({ default: Loaded }), suspensible: false })
    const html = await read(renderToStream(inSuspense(h(A, {}))))
    expect(html).toContain('<b class="loaded">loaded</b>')
  })

  it('never schedules the client-only delay / timeout timers', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    try {
      const A = defineAsyncComponent({
        loader: () => Promise.resolve({ default: Loaded }),
        loadingComponent: Loading,
        delay: 7_777,
        timeout: 8_888,
      })
      await renderToString(h('div', null, h(A, {})))
      const scheduled = spy.mock.calls.map((c) => c[1])
      expect(scheduled).not.toContain(7_777)
      expect(scheduled).not.toContain(8_888)
    } finally {
      spy.mockRestore()
    }
  })

  it('a failed load is retried by the NEXT render (Vue: every request re-runs the loader after a failure)', async () => {
    let calls = 0
    const A = defineAsyncComponent({
      loader: () => (++calls === 1 ? slow(null).then(() => Promise.reject(new Error('cold 500'))) : slow({ default: Loaded })),
      errorComponent: Failed,
    })
    const first = await renderToString(inSuspense(h(A, {})))
    expect(first).toContain('<u class="error">cold 500</u>')
    // The next request must WAIT for the retry rather than render the
    // still-loading state — the server never re-renders.
    const second = await renderToString(inSuspense(h(A, {})))
    expect(calls).toBe(2)
    expect(second).toContain('<b class="loaded">loaded</b>')
    const bare = await renderToString(h('div', null, h(A, {})))
    expect(calls).toBe(2)
    expect(bare).toContain('<b class="loaded">loaded</b>')
  })
})
