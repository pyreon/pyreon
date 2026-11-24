// Real-Chromium proof for #4814: a search box that writes its value to the
// query through `router.replace` on every keystroke keeps its page mounted —
// same DOM node, focus, caret and typed text survive real typing — and the
// router neither resets the scroll nor starts a view transition for it.
// happy-dom has no real focus, typing or `startViewTransition`, so this is the
// test that shows what a user sees.
import { h, onMount } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createRouter, RouterProvider, RouterView, useLoaderData } from '../index'
import { setActiveRouter } from '../router'
import type { Router } from '../types'

let router: Router | null = null

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  router?.destroy()
  router = null
  setActiveRouter(null)
  window.location.hash = ''
})

describe('typing into a query-backed search box (#4814)', () => {
  it('keeps the page, the input and its focus across every keystroke', async () => {
    let mounts = 0
    const r = createRouter({
      mode: 'hash',
      routes: [
        {
          path: '/search',
          component: (props: Record<string, unknown>) => {
            onMount(() => {
              mounts++
            })

            return h(
              'div',
              null,
              h('input', {
                id: 'q',
                onInput: (e: Event) => {
                  const v = (e.target as HTMLInputElement).value
                  void r.replace(`/search?q=${encodeURIComponent(v)}`)
                },
              }),
              // The live `query` prop: no remount delivers the new value any more.
              h('output', { id: 'shown' }, () => (props.query as Record<string, string>).q ?? ''),
            )
          },
        },
      ],
    })
    router = r
    await r.push('/search')
    const { container, unmount } = mountInBrowser(h(RouterProvider, { router: r }, h(RouterView, {})))
    await flush()
    expect(mounts).toBe(1)

    const vtSpy = vi.spyOn(document as Document & { startViewTransition: () => unknown }, 'startViewTransition')
    const input = container.querySelector<HTMLInputElement>('#q')!
    await userEvent.click(input)
    await userEvent.keyboard('pyreon')
    await flush()
    await flush()

    expect(window.location.hash).toBe('#/search?q=pyreon')
    expect(mounts).toBe(1)
    expect(container.querySelector('#q')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('pyreon')
    expect(container.querySelector('#shown')?.textContent).toBe('pyreon')
    expect(vtSpy).not.toHaveBeenCalled()
    vtSpy.mockRestore()
    unmount()
  })
})

describe('a server-loader search page (the zero shape) while typing (#4814)', () => {
  it('keeps the input and its focus; the refetched data arrives in place', async () => {
    let mounts = 0
    let fetches = 0
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetches++
      const q = new URL(String(input), location.origin).searchParams.get('path') ?? ''
      const hits = decodeURIComponent(q).split('q=')[1] ?? ''

      return new Response(JSON.stringify({ data: { '0': { hits } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    try {
      const r = createRouter({
        mode: 'hash',
        routes: [
          { path: '/', component: () => h('p', null, 'home') },
          {
            path: '/search',
            hasServerLoader: true,
            errorComponent: () => h('p', null, 'ERR'),
            component: () => {
              onMount(() => {
                mounts++
              })
              const data = useLoaderData<{ hits: string }>()

              return h(
                'div',
                null,
                h('input', {
                  id: 'q',
                  onInput: (e: Event) => {
                    void r.replace(`/search?q=${(e.target as HTMLInputElement).value}`)
                  },
                }),
                h('output', { id: 'hits' }, () => data()?.hits ?? ''),
              )
            },
          },
        ],
      })
      router = r
      const { container, unmount } = mountInBrowser(h(RouterProvider, { router: r }, h(RouterView, {})))
      await r.push('/search')
      await flush()
      expect(mounts).toBe(1)

      const input = container.querySelector<HTMLInputElement>('#q')!
      await userEvent.click(input)
      await userEvent.keyboard('abc')
      for (let i = 0; i < 20 && container.querySelector('#hits')?.textContent !== 'abc'; i++) await flush()

      expect(mounts).toBe(1)
      expect(fetches).toBe(4) // the push + one per keystroke
      expect(container.querySelector('#q')).toBe(input)
      expect(document.activeElement).toBe(input)
      expect(container.querySelector('#hits')?.textContent).toBe('abc')
      unmount()
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('a real View Transition whose update is deferred (#4814)', () => {
  it('the page on screen never sees the data loaded for the next route', async () => {
    const seen: string[] = []
    let n = 0
    const doc = document as Document & { startViewTransition: (cb: () => unknown) => unknown }
    const real = doc.startViewTransition.bind(doc)
    // Chromium's own transition, with its DOM update deferred 30 ms.
    doc.startViewTransition = (cb: () => unknown) =>
      real(() => new Promise<void>((r) => setTimeout(() => {
        cb()
        r()
      }, 30)))
    try {
      const Page = () => {
        const me = ++n
        const data = useLoaderData<{ p: string }>()
        effect(() => {
          seen.push(`inst${me}:${data()?.p}`)
        })

        return h('p', { id: `p${me}` }, 'p')
      }
      const r = createRouter({
        mode: 'hash',
        routes: [
          { path: '/', component: () => h('p', null, 'h') },
          { path: '/p/:id', component: Page, loader: async ({ params }) => ({ p: params.id }) },
          { path: '/x', component: () => h('p', null, 'x'), loader: () => new Promise((res) => setTimeout(() => res({}), 100)) },
        ],
      })
      router = r
      const { unmount } = mountInBrowser(h(RouterProvider, { router: r }, h(RouterView, {})))
      await r.push('/p/1')
      await flush()
      const toP2 = r.push('/p/2')
      await new Promise((res) => setTimeout(res, 15))
      void r.push('/x')
      await toP2.catch(() => undefined)
      await new Promise((res) => setTimeout(res, 200))
      expect(seen.filter((e) => e.startsWith('inst1:'))).toEqual(['inst1:1'])
      unmount()
    } finally {
      Reflect.deleteProperty(doc, 'startViewTransition')
    }
  })
})
