/**
 * `defineAsyncComponent`'s options form — Vue 3 semantics for
 * `loadingComponent`, `errorComponent`, `delay`, `timeout`, `suspensible` and
 * `onError` (client). The server half lives in `async-component-ssr.test.ts`,
 * which runs in a node environment so `isServer` is true there.
 *
 * Real timers throughout (fake timers interact badly with the promise chains
 * under test); the delays are small but every assertion is on a settled state,
 * never on a race.
 */
import type { ComponentFn } from '@pyreon/core'
import { ErrorBoundary, h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { defineAsyncComponent, ref, Suspense } from '../index'
import { jsx } from '../jsx-runtime'

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

type Mod = { default: ComponentFn }

function deferred() {
  let resolve!: (m: Mod | ComponentFn) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<Mod | ComponentFn>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const Loaded: ComponentFn = () => h('b', { class: 'loaded' }, 'loaded')
const Loading: ComponentFn = () => h('i', { class: 'loading' }, 'loading')
const Failed: ComponentFn<{ error: Error }> = (p) => h('u', { class: 'error' }, p.error.message)

function mountIn(vnode: ReturnType<typeof h>) {
  const c = document.createElement('div')
  document.body.appendChild(c)
  const dispose = mount(vnode, c)
  return {
    c,
    dispose: () => {
      dispose()
      c.remove()
    },
  }
}

describe('defineAsyncComponent — loadingComponent + delay', () => {
  it('shows loadingComponent only after `delay`, then the loaded component', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, loadingComponent: Loading, delay: 40 })
    const { c, dispose } = mountIn(h(A, {}))
    expect(c.querySelector('.loading')).toBeNull()
    await tick(80)
    expect(c.querySelector('.loading')).not.toBeNull()
    d.resolve({ default: Loaded })
    await tick()
    expect(c.querySelector('.loading')).toBeNull()
    expect(c.querySelector('.loaded')?.textContent).toBe('loaded')
    dispose()
  })

  it('`delay: 0` shows loadingComponent immediately', () => {
    const A = defineAsyncComponent({ loader: () => deferred().promise, loadingComponent: Loading, delay: 0 })
    const { c, dispose } = mountIn(h(A, {}))
    expect(c.querySelector('.loading')).not.toBeNull()
    dispose()
  })

  it('defaults `delay` to 200ms, as in Vue', async () => {
    const A = defineAsyncComponent({ loader: () => deferred().promise, loadingComponent: Loading })
    const { c, dispose } = mountIn(h(A, {}))
    await tick(100)
    expect(c.querySelector('.loading')).toBeNull()
    await tick(180)
    expect(c.querySelector('.loading')).not.toBeNull()
    dispose()
  })

  it('a load that beats the delay never shows loadingComponent', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, loadingComponent: Loading, delay: 30 })
    const { c, dispose } = mountIn(h(A, {}))
    d.resolve({ default: Loaded })
    await tick(60)
    expect(c.querySelector('.loading')).toBeNull()
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('mounts a framework-style loadingComponent inside a compat render frame', () => {
    // `ref` throws "called outside of a component render" if the component
    // is mounted raw rather than through the compat wrapper `jsx()` would use.
    const VueLoading: ComponentFn = () => {
      const label = ref('vue-loading')
      return jsx('i', { class: 'loading', children: label.value })
    }
    const A = defineAsyncComponent({ loader: () => deferred().promise, loadingComponent: VueLoading, delay: 0 })
    const { c, dispose } = mountIn(h(A, {}))
    expect(c.querySelector('.loading')?.textContent).toBe('vue-loading')
    dispose()
  })
})

describe('defineAsyncComponent — errors, timeout, onError', () => {
  it('renders errorComponent with `{ error }` when the load fails', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, errorComponent: Failed, delay: 0, loadingComponent: Loading })
    const { c, dispose } = mountIn(h(A, {}))
    d.reject(new Error('chunk 404'))
    await tick()
    expect(c.querySelector('.loading')).toBeNull()
    expect(c.querySelector('.error')?.textContent).toBe('chunk 404')
    dispose()
  })

  it('without errorComponent, a failure after mount reaches the nearest <ErrorBoundary>', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise })
    const { c, dispose } = mountIn(
      h(ErrorBoundary, { fallback: (err: unknown) => h('p', { class: 'eb' }, (err as Error).message) }, h(A, {})),
    )
    d.reject(new Error('late failure'))
    await tick()
    expect(c.querySelector('.eb')?.textContent).toBe('late failure')
    dispose()
  })

  it('`timeout` turns a pending load into an error', async () => {
    const A = defineAsyncComponent({ loader: () => deferred().promise, errorComponent: Failed, timeout: 30 })
    const { c, dispose } = mountIn(h(A, {}))
    expect(c.querySelector('.error')).toBeNull()
    await tick(60)
    expect(c.querySelector('.error')?.textContent).toBe('Async component timed out after 30ms.')
    dispose()
  })

  it('a load that lands after its timeout still replaces the error, as in Vue', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, errorComponent: Failed, timeout: 20 })
    const { c, dispose } = mountIn(h(A, {}))
    await tick(50)
    expect(c.querySelector('.error')).not.toBeNull()
    d.resolve({ default: Loaded })
    await tick()
    expect(c.querySelector('.error')).toBeNull()
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('onError can retry; `attempts` counts from 1', async () => {
    const attempts: number[] = []
    let calls = 0
    const A = defineAsyncComponent({
      loader: () => (++calls < 3 ? Promise.reject(new Error(`try ${calls}`)) : Promise.resolve({ default: Loaded })),
      onError: (_err, retry, _fail, n) => {
        attempts.push(n)
        retry()
      },
    })
    const { c, dispose } = mountIn(h(A, {}))
    await tick(20)
    expect(attempts).toEqual([1, 2])
    expect(calls).toBe(3)
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('onError `fail()` settles the load as an error', async () => {
    const seen: string[] = []
    const A = defineAsyncComponent({
      loader: () => Promise.reject(new Error('nope')),
      errorComponent: Failed,
      onError: (err, _retry, fail) => {
        seen.push(err.message)
        fail()
      },
    })
    const { c, dispose } = mountIn(h(A, {}))
    await tick(10)
    expect(seen).toEqual(['nope'])
    expect(c.querySelector('.error')?.textContent).toBe('nope')
    dispose()
  })

  it('accepts a loader that resolves to the component itself (not a module)', async () => {
    const A = defineAsyncComponent(() => Promise.resolve(Loaded))
    const { c, dispose } = mountIn(h(A, {}))
    await tick()
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('a loader that resolves to a non-component is an error, not a crash at render', async () => {
    const A = defineAsyncComponent({
      loader: () => Promise.resolve({ default: 42 } as unknown as Mod),
      errorComponent: Failed,
    })
    const { c, dispose } = mountIn(h(A, {}))
    await tick()
    expect(c.querySelector('.error')?.textContent).toContain('not a component')
    dispose()
  })
})

describe('defineAsyncComponent — suspensible', () => {
  const inSuspense = (child: unknown) =>
    h('main', null, jsx(Suspense as unknown as ComponentFn, { fallback: h('s', { class: 'fb' }, 'fb'), children: child }))

  it('suspensible (default): the <Suspense> fallback shows, loadingComponent does not', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, loadingComponent: Loading, delay: 0 })
    const { c, dispose } = mountIn(inSuspense(h(A, {})))
    expect(c.querySelector('.fb')).not.toBeNull()
    expect(c.querySelector('.loading')).toBeNull()
    d.resolve({ default: Loaded })
    await tick()
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('`suspensible: false`: renders its own loadingComponent, the <Suspense> fallback does not show', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, loadingComponent: Loading, delay: 0, suspensible: false })
    const { c, dispose } = mountIn(inSuspense(h(A, {})))
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.querySelector('.loading')).not.toBeNull()
    d.resolve({ default: Loaded })
    await tick()
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('a failed load under <Suspense> renders errorComponent rather than throwing', async () => {
    const d = deferred()
    const A = defineAsyncComponent({ loader: () => d.promise, errorComponent: Failed })
    const { c, dispose } = mountIn(inSuspense(h(A, {})))
    d.reject(new Error('boom'))
    await tick()
    expect(c.querySelector('.error')?.textContent).toBe('boom')
    dispose()
  })
})

describe('defineAsyncComponent — timers are released (leak class I)', () => {
  function trackTimers() {
    const created = new Set<unknown>()
    const cleared = new Set<unknown>()
    const realSet = globalThis.setTimeout
    const realClear = globalThis.clearTimeout
    const setSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      const id = realSet(fn, ms)
      if (ms === 5_000 || ms === 5_001) created.add(id)
      return id
    }) as typeof setTimeout)
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((id?: ReturnType<typeof setTimeout>) => {
      cleared.add(id)
      realClear(id)
    }) as typeof clearTimeout)
    return {
      pending: () => [...created].filter((id) => !cleared.has(id)).length,
      created: () => created.size,
      restore: () => {
        setSpy.mockRestore()
        clearSpy.mockRestore()
      },
    }
  }

  it('clears the delay and timeout timers once the load succeeds', async () => {
    const d = deferred()
    const t = trackTimers()
    try {
      const A = defineAsyncComponent({ loader: () => d.promise, loadingComponent: Loading, delay: 5_000, timeout: 5_001 })
      const { dispose } = mountIn(h(A, {}))
      expect(t.created()).toBe(2)
      d.resolve({ default: Loaded })
      await tick()
      expect(t.pending()).toBe(0)
      dispose()
    } finally {
      t.restore()
    }
  })

  it('clears both timers when the component unmounts mid-load', () => {
    const t = trackTimers()
    try {
      const A = defineAsyncComponent({ loader: () => deferred().promise, loadingComponent: Loading, delay: 5_000, timeout: 5_001 })
      const { dispose } = mountIn(h(A, {}))
      expect(t.created()).toBe(2)
      dispose()
      expect(t.pending()).toBe(0)
    } finally {
      t.restore()
    }
  })
})
