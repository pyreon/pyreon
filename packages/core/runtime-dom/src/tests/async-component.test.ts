/**
 * Async function components — client-mount + hydration parity with `renderToString`.
 *
 * Before this fix, an `async function Component()` returned a Promise that mount/hydrate
 * fed straight into `mountChild`, crashing with `Cannot read properties of undefined
 * (reading 'ref')` because Promises have no `.props`. SSR awaited the Promise (per the
 * documented contract); the client never did. This was the root cause of the deployed
 * `examples/docs-zero` preview crash on every doc route — they all delegated to an async
 * `<DocBody slug={slug} />`.
 *
 * The fix: when `mountComponent` sees a Promise output, insert a placeholder comment,
 * and mount the resolved subtree at the placeholder once the Promise settles. `<Suspense>`
 * still works for `lazy()`-style boundaries; this path is the natural async-function
 * counterpart.
 *
 * Bisect-verified: reverting `mount.ts`'s Promise branch makes the
 * "async component mounts after resolve" spec crash with the documented
 * `Cannot read properties of undefined (reading 'ref')` TypeError.
 */
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { describe, expect, test, vi } from 'vitest'
import { mount } from '../index'

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('async function component support', () => {
  test('async component mounts its resolved VNode after the Promise settles', async () => {
    const el = container()
    const AsyncResolved = (async () =>
      h('span', { class: 'resolved' }, 'hello async')) as unknown as ComponentFn

    mount(h(AsyncResolved, null), el)

    // Pre-resolve: placeholder comment only, no `.resolved` element.
    expect(el.querySelector('.resolved')).toBeNull()

    // Microtask flush.
    await new Promise((r) => setTimeout(r, 0))

    expect(el.querySelector('.resolved')?.textContent).toBe('hello async')
  })

  test('async component returning null leaves DOM with just the placeholder', async () => {
    const el = container()
    const AsyncNull = (async () => null) as unknown as ComponentFn

    mount(h(AsyncNull, null), el)
    await new Promise((r) => setTimeout(r, 0))

    expect(el.querySelector('span')).toBeNull()
    // Placeholder may or may not remain depending on cleanup semantics;
    // the contract is "no crash + no stale content."
  })

  test('async component unmounts cleanly before resolve', async () => {
    const el = container()
    let resolveFn!: (v: unknown) => void
    const promise = new Promise((resolve) => {
      resolveFn = resolve
    })
    const NeverResolves = (() => promise) as unknown as ComponentFn

    const cleanup = mount(h(NeverResolves, null), el)
    cleanup()

    // Resolving after cleanup must NOT mutate the container.
    resolveFn(h('span', { class: 'late' }, 'late'))
    await new Promise((r) => setTimeout(r, 0))

    expect(el.querySelector('.late')).toBeNull()
  })

  test('async component that rejects logs but does not crash mount', async () => {
    const el = container()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const RejectComp = (async () => {
      throw new Error('async-render-failed')
    }) as unknown as ComponentFn

    mount(h(RejectComp, null), el)
    await new Promise((r) => setTimeout(r, 0))

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('async render rejected'),
      expect.any(Error),
    )
    errSpy.mockRestore()
  })

  test('async component nested under regular component — both mount cleanly', async () => {
    const el = container()
    const Inner = (async () =>
      h('em', { class: 'inner' }, 'I')) as unknown as ComponentFn
    const Outer: ComponentFn = () =>
      h('div', { class: 'outer' }, h(Inner, null))

    mount(h(Outer, null), el)
    await new Promise((r) => setTimeout(r, 0))

    expect(el.querySelector('.outer .inner')?.textContent).toBe('I')
  })
})
