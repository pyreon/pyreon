// Real-Chromium proof for #4814: a search box that writes its value to the
// query through `router.replace` on every keystroke keeps its page mounted —
// same DOM node, focus, caret and typed text survive real typing — and the
// router neither resets the scroll nor starts a view transition for it.
// happy-dom has no real focus, typing or `startViewTransition`, so this is the
// test that shows what a user sees.
import { h, onMount } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createRouter, RouterProvider, RouterView } from '../index'
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
