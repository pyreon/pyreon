import { h, onMount, onUnmount } from '@pyreon/core'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UrlStateSignal } from '../types'
import { setUrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

// With `setUrlRouter(router)` every `useUrlState().set()` is a `router.replace`
// that changes only the query. The page that owns the search box must stay
// mounted through it: the router used to remount the route component on every
// such write, so the input lost focus and local state reset per keystroke
// (#4814).

const settle = () => new Promise<void>((r) => setTimeout(r, 0))

let cleanup: (() => void) | undefined

beforeEach(() => {
  history.replaceState(null, '', '/search')
  setUrlRouter(null)
})

afterEach(() => {
  setUrlRouter(null)
  cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
})

describe.each(['history', 'memory'] as const)('the real @pyreon/router (%s mode)', (mode) => {
  it('a url-state write keeps the route component mounted', async () => {
    const counts = { mounts: 0, unmounts: 0 }
    let q: UrlStateSignal<string> | undefined
    const SearchPage = () => {
      q = useUrlState('q', '')
      onMount(() => {
        counts.mounts++
      })
      onUnmount(() => {
        counts.unmounts++
      })

      return h('input', { id: 'search' })
    }
    const router = createRouter({
      mode,
      routes: [{ path: '/search', component: SearchPage }],
      ...(mode === 'memory' ? { initialEntries: ['/search'] } : {}),
    })
    setUrlRouter(router)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(h(RouterProvider, { router }, h(RouterView, null)), el)
    cleanup = () => {
      unmount()
      router.destroy()
    }
    await settle()
    const input = el.querySelector('#search')
    expect(counts.mounts).toBe(1)

    for (const value of ['p', 'py', 'pyr']) {
      q!.set(value)
      await settle()
    }

    expect(router.currentRoute().query).toEqual({ q: 'pyr' })
    expect(q!()).toBe('pyr')
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
    expect(el.querySelector('#search')).toBe(input) // the same DOM node
  })
})
