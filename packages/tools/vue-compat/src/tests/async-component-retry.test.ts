/**
 * A failed `defineAsyncComponent` load is retried by the NEXT mount, as in Vue
 * (`runtime-core/src/apiAsyncComponent.ts`: the instance's `onError` clears
 * `pendingRequest`, so the next `load()` is a new request). An instance
 * already showing the error keeps showing it.
 *
 * The loop guard is the load-bearing half: a `<Suspense>` does not mount a
 * still-loading child, so when the load fails the boundary mounts it for the
 * FIRST time — that instance must render the error, not retry, or a
 * permanently failing loader spins forever.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { defineAsyncComponent, Suspense } from '../index'
import { jsx } from '../jsx-runtime'

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

const Loaded: ComponentFn = () => h('b', { class: 'loaded' }, 'loaded')
const Failed: ComponentFn<{ error: Error }> = (p) => h('u', { class: 'error' }, p.error.message)

const inSuspense = (child: VNodeChild) =>
  h('main', null, jsx(Suspense as unknown as ComponentFn, { fallback: h('s', { class: 'fb' }, 'fb'), children: child }))

function mountIn(vnode: VNodeChild) {
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

/** A loader that fails its first `failures` calls, then loads. */
function flaky(failures: number) {
  const state = { calls: 0 }
  const loader = () => {
    const n = ++state.calls
    return new Promise<{ default: ComponentFn }>((res, rej) =>
      setTimeout(() => (n <= failures ? rej(new Error(`fail ${n}`)) : res({ default: Loaded })), 5),
    )
  }
  return { state, loader }
}

describe('defineAsyncComponent — a failed load is retried by the next mount (Vue)', () => {
  it('the next mount loads again; the errored instance keeps its error', async () => {
    const { state, loader } = flaky(1)
    const A = defineAsyncComponent({ loader, errorComponent: Failed })

    const first = mountIn(h('div', null, h(A, {})))
    await tick(20)
    expect(first.c.querySelector('.error')?.textContent).toBe('fail 1')
    expect(state.calls).toBe(1)

    const second = mountIn(h('div', null, h(A, {})))
    await tick(20)
    expect(state.calls).toBe(2)
    expect(second.c.querySelector('.loaded')).not.toBeNull()
    // The first instance showed a failure; a later attempt succeeding does not
    // rewrite it (Vue's error is per instance).
    expect(first.c.querySelector('.error')?.textContent).toBe('fail 1')
    expect(first.c.querySelector('.loaded')).toBeNull()

    // Loaded for the definition: a third mount renders it without loading.
    const third = mountIn(h('div', null, h(A, {})))
    expect(third.c.querySelector('.loaded')).not.toBeNull()
    expect(state.calls).toBe(2)
    first.dispose()
    second.dispose()
    third.dispose()
  })

  it('instances mounted while ONE load runs share it, and all show its failure', async () => {
    const { state, loader } = flaky(1)
    const A = defineAsyncComponent({ loader, errorComponent: Failed })
    const { c, dispose } = mountIn(h('div', null, h(A, {}), h(A, {})))
    await tick(20)
    expect(state.calls).toBe(1)
    expect(c.querySelectorAll('.error').length).toBe(2)
    dispose()
  })

  it('under <Suspense>, a permanently failing loader renders the error ONCE — no retry loop', async () => {
    const { state, loader } = flaky(Number.POSITIVE_INFINITY)
    const A = defineAsyncComponent({ loader, errorComponent: Failed })
    const { c, dispose } = mountIn(inSuspense(h(A, {})))
    expect(c.querySelector('.fb')).not.toBeNull()
    await tick(60)
    expect(c.querySelector('.error')?.textContent).toBe('fail 1')
    expect(c.querySelector('.fb')).toBeNull()
    expect(state.calls).toBe(1)
    dispose()
  })

  it('a NEW <Suspense> mount after a shown failure retries, showing the boundary fallback meanwhile', async () => {
    const { state, loader } = flaky(1)
    const A = defineAsyncComponent({ loader, errorComponent: Failed })
    const first = mountIn(inSuspense(h(A, {})))
    await tick(20)
    expect(first.c.querySelector('.error')?.textContent).toBe('fail 1')

    const second = mountIn(inSuspense(h(A, {})))
    expect(second.c.querySelector('.fb')).not.toBeNull()
    await tick(20)
    expect(state.calls).toBe(2)
    expect(second.c.querySelector('.loaded')).not.toBeNull()
    expect(second.c.querySelector('.fb')).toBeNull()
    first.dispose()
    second.dispose()
  })

  it('a conditional re-mount retries (the Vue `v-if` toggle shape)', async () => {
    const { state, loader } = flaky(1)
    const A = defineAsyncComponent({ loader, errorComponent: Failed })
    const show = signal(true)
    const { c, dispose } = mountIn(h('div', null, () => (show() ? h(A, {}) : null)))
    await tick(20)
    expect(c.querySelector('.error')).not.toBeNull()
    show.set(false)
    show.set(true)
    await tick(20)
    expect(state.calls).toBe(2)
    expect(c.querySelector('.loaded')).not.toBeNull()
    dispose()
  })

  it('without errorComponent (the failure is thrown), the next mount still retries', async () => {
    const { state, loader } = flaky(1)
    const A = defineAsyncComponent({ loader })
    const first = mountIn(
      h('div', null, jsx(Suspense as unknown as ComponentFn, { fallback: 'fb', children: h(A, {}) })),
    )
    await tick(20)
    expect(state.calls).toBe(1)
    const second = mountIn(h('div', null, h(A, {})))
    await tick(20)
    expect(state.calls).toBe(2)
    expect(second.c.querySelector('.loaded')).not.toBeNull()
    first.dispose()
    second.dispose()
  })
})
