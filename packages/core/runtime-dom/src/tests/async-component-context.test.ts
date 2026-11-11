/**
 * Async function components keep their ancestors' context on the client (#4377).
 *
 * `mount` and `hydrate` render an async component's resolved subtree in a
 * `.then()` microtask. Context is owner-based on the client, and that microtask
 * had no owner set, so every `useContext()` in the resolved subtree read the
 * context's DEFAULT: ancestor providers (router, `<PyreonUI>`, a user
 * `provide()`) and anything the async component provided before its first
 * `await` were invisible. SSR was right (`renderToString` keeps context across
 * the await), so only the mounted / hydrated page was wrong. On pyreon.dev a
 * nested `<PyreonUI mode="light">` under an async route body believed it was
 * the root and flipped `<html data-theme>` to light.
 *
 * The mount path ALSO left the async component's scope as the current owner
 * after returning (it restored the parent owner only on unmount), so the
 * component's later siblings resolved context through it.
 *
 * The hydrate path's microtask also ran outside the hydration WALK (the
 * hydrating flag was off), so a `<Suspense>` in the resolved subtree replaced
 * the server content of a still-loading lazy child with its fallback and
 * remounted it on load. `hydrateDeferredLazy` already re-entered both the
 * owner and the flag; the async-component branch now does the same.
 *
 * Bisect-verified (recorded in the PR): removing the `runWithContextOwner(scope,
 * …)` wrapper in mount.ts / hydrate.ts makes the ancestor and self-provided
 * specs read `'default'`; moving `setContextOwner(prevOwner)` back into the
 * unmount closure makes the sibling spec read `'from-async'`; dropping the
 * `setHydrating(true)` around the async hydrate makes the Suspense spec show
 * the fallback instead of the server node.
 */
import { Suspense, createContext, h, lazy, provide, useContext } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, describe, expect, test } from 'vitest'
import { hydrateRoot } from '../hydrate'
import { disableHydrationWarnings, mount } from '../index'

const Ctx = createContext('default')

/** Every value a Leaf read, in mount order. Hydration adopts the server text
 * as-is, so the DOM alone cannot show what the client read. */
let seen: string[] = []

function Leaf(): ReturnType<typeof h> {
  const value = useContext(Ctx)
  seen.push(value)
  return h('span', { class: 'leaf' }, value)
}

/** Resolves after a real macrotask, so the resolved subtree mounts well outside setup. */
const AsyncBody = (async () => {
  await new Promise((r) => setTimeout(r, 0))
  return h(Leaf, null)
}) as unknown as ComponentFn

/** Provides BEFORE its first await, then resolves to a consumer. */
const AsyncProvider = (async () => {
  provide(Ctx, 'from-async')
  await new Promise((r) => setTimeout(r, 0))
  return h(Leaf, null)
}) as unknown as ComponentFn

function Provider(props: { children?: unknown }): ReturnType<typeof h> {
  provide(Ctx, 'provided')
  return h('main', null, props.children as never)
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

function container(html = ''): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

const leaves = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('.leaf')].map((n) => n.textContent ?? '')

afterEach(async () => {
  // Let a pending async component from a failed spec settle here, not in the next spec.
  await settle()
  document.body.innerHTML = ''
  seen = []
})

describe('async component context on mount (#4377)', () => {
  test('the resolved subtree sees a context provided above the async component', async () => {
    const el = container()
    mount(h(Provider, null, h(AsyncBody, null)), el)
    await settle()
    expect(seen).toEqual(['provided'])
    expect(leaves(el)).toEqual(['provided'])
  })

  test('the resolved subtree sees a context the async component provided before its await', async () => {
    const el = container()
    mount(h(Provider, null, h(AsyncProvider, null)), el)
    await settle()
    expect(seen).toEqual(['from-async'])
    expect(leaves(el)).toEqual(['from-async'])
  })

  test("a sibling mounted after the async component does not see the async component's context", async () => {
    const el = container()
    mount(h(Provider, null, h(AsyncProvider, null), h(Leaf, null)), el)
    // The sibling Leaf mounts synchronously, while AsyncProvider is still pending.
    expect(leaves(el)).toEqual(['provided'])
    await settle()
    expect(leaves(el)).toEqual(['from-async', 'provided'])
  })
})

describe('async component context on hydrate (#4377)', () => {
  test('the resolved subtree sees a context provided above the async component', async () => {
    // SSR output: renderToString keeps context across the await, so it rendered 'provided'.
    const el = container('<main><!--$pas--><span class="leaf">provided</span><!--$pae--></main>')
    const span = el.querySelector('.leaf')
    hydrateRoot(el, h(Provider, null, h(AsyncBody, null)))
    await settle()
    expect(seen).toEqual(['provided'])
    // Adopted in place, not re-rendered.
    expect(el.querySelector('.leaf')).toBe(span)
  })

  test('the resolved subtree sees a context the async component provided before its await', async () => {
    const el = container('<main><!--$pas--><span class="leaf">from-async</span><!--$pae--></main>')
    hydrateRoot(el, h(Provider, null, h(AsyncProvider, null)))
    await settle()
    expect(seen).toEqual(['from-async'])
  })
})

describe('async component hydrate runs inside the hydration walk', () => {
  test('a <Suspense> in the resolved subtree keeps the server content of a still-loading lazy child', async () => {
    disableHydrationWarnings()
    const Quote: ComponentFn<{ who: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who}`)
    const app = (L: unknown) => {
      const AsyncSection = (async () => {
        await new Promise((r) => setTimeout(r, 0))
        return h(Suspense, { fallback: h('i', { class: 'fb' }, 'loading') }, h(L as ComponentFn, { who: 'a' }))
      }) as unknown as ComponentFn
      return h('div', { class: 'app' }, h(AsyncSection, null))
    }
    const html = await renderToString(app(lazy(() => Promise.resolve({ default: Quote }))))
    const el = container(html)
    const serverQuote = el.querySelector('.q')
    expect(serverQuote).not.toBeNull()

    // The client chunk has not landed when the async section resolves.
    let release!: () => void
    const slowLazy = lazy<{ who: string }>(
      () => new Promise((r) => (release = () => r({ default: Quote }))),
    )
    hydrateRoot(el, app(slowLazy))
    await settle()
    expect(el.querySelector('.fb')).toBeNull()
    expect(el.querySelector('.q')).toBe(serverQuote)

    release()
    await settle()
    expect(el.querySelector('.q')).toBe(serverQuote)
    expect(el.querySelector('.q')?.textContent).toBe('quote:a')
  })
})
