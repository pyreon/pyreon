// @vitest-environment node
//
// The registry seams publish only on a server (`document` undefined), and the
// renderer is the real one.
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { renderToStream, renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { defineStore, dehydrateStores } from '../index'

/**
 * A store runs its setup in its OWN `effectScope`, so the request's owner scope
 * never sees what setup creates. Under SSR each request gets a fresh registry
 * (a fresh store), and the registry used to be DROPPED at the end of the
 * request without disposing its stores: a setup effect or computed over a
 * signal that outlives the request stayed subscribed — with that request's
 * store state in its closure — one per request, forever.
 */
const subs = (s: { debug(): { subscriberCount: number } }): number => s.debug().subscriberCount

describe('SSR: a request disposes the stores it created', () => {
  it('renderToString: 100 renders leave the shared signal at its baseline', async () => {
    const shared = signal(1)
    const base = subs(shared)
    const useCart = defineStore('ssr-dispose-cart', () => {
      const items = signal<string[]>([])
      effect(() => {
        shared()
      })
      const total = computed(() => shared() + items().length)
      return { items, total }
    })
    const Page = (): VNodeChild => h('p', null, String(useCart().store.total()))
    for (let i = 0; i < 100; i++) expect(await renderToString(h(Page, null))).toContain('1')
    expect(subs(shared)).toBe(base)
  })

  it('runWithRequestContext: stores live until the request ends, then are disposed', async () => {
    const shared = signal(1)
    const base = subs(shared)
    const useUser = defineStore('ssr-dispose-user', () => {
      const name = signal('anon')
      effect(() => {
        shared()
      })
      return { name }
    })
    for (let i = 0; i < 20; i++) {
      await runWithRequestContext(async () => {
        const Page = (): VNodeChild => {
          useUser().store.name.set(`u${i}`)
          return h('p', null, 'x')
        }
        await renderToString(h(Page, null))
        // Read after the render, in the request, as `renderPage` does.
        expect(dehydrateStores()['ssr-dispose-user']).toEqual({ name: `u${i}` })
        expect(subs(shared)).toBe(base + 1)
      })
    }
    expect(subs(shared)).toBe(base)
  })

  it('renderToStream: disposed when the stream ends', async () => {
    const shared = signal(1)
    const base = subs(shared)
    const useFeed = defineStore('ssr-dispose-feed', () => {
      effect(() => {
        shared()
      })
      return { n: signal(0) }
    })
    const Page = (): VNodeChild => h('p', null, String(useFeed().store.n()))
    for (let i = 0; i < 20; i++) {
      const reader = renderToStream(h(Page, null)).getReader()
      while (!(await reader.read()).done) {
        /* drain */
      }
    }
    expect(subs(shared)).toBe(base)
  })
})
