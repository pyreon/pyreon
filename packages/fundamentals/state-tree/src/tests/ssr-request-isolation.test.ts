// @vitest-environment node
/**
 * Per-request isolation of the `asHook` singleton registry under SSR.
 *
 * `asHook(id)` is a process-global singleton — the feature in a browser, where
 * one process serves one user, and a cross-request bleed on a server, where
 * one process serves everyone: before the fix two concurrent requests calling
 * `Cart.asHook('cart')()` got the SAME instance, so request B saw request A's
 * cart. `resetHook` existed but nothing on the render path called it, and
 * nothing upstream could — neither `@pyreon/server` nor `@pyreon/zero` depends
 * on this package.
 *
 * NODE environment deliberately (`@vitest-environment node`): the `globalThis`
 * seam is published under `isServer` (`typeof document === 'undefined'`), so
 * under the package's default happy-dom it is never published and the bug is
 * not reachable.
 */
import { runWithRequestContext } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { model } from '../model'

const Cart = model({ state: { items: [] as string[] } }).actions((self) => ({
  add: (item: string) => self.items.update((prev: string[]) => [...prev, item]),
}))

describe('SSR per-request asHook isolation', () => {
  it('gives each concurrent request its OWN hook instance', async () => {
    const useCart = Cart.asHook('cart')

    const render = (item: string | null): Promise<{ items: string[]; inst: unknown }> =>
      runWithRequestContext(async () => {
        const cart = useCart()
        if (item !== null) cart.add(item)
        return { items: cart.items(), inst: cart }
      })

    const [a, b] = await Promise.all([render('alice-book'), render('bob-lamp')])

    expect(a.items).toEqual(['alice-book'])
    expect(b.items).toEqual(['bob-lamp'])
    expect(a.inst).not.toBe(b.inst)

    // A third, anonymous request must see the model's default — not whatever
    // the first two left behind.
    const c = await render(null)
    expect(c.items).toEqual([])
    expect(c.inst).not.toBe(a.inst)
  })

  it('keeps the singleton contract OUTSIDE a request scope', () => {
    // No request scope ⇒ the provider answers `undefined` ⇒ the module-level
    // registry, i.e. the documented Pinia/Zustand behaviour. A provider that
    // fabricated a throwaway Map here would re-create the instance per call
    // and silently break `asHook` for every non-render caller.
    const useCounter = model({ state: { n: 0 } }).asHook('outside')
    const first = useCounter()
    first.n.set(7)
    expect(useCounter()).toBe(first)
    expect(useCounter().n()).toBe(7)
  })
})
