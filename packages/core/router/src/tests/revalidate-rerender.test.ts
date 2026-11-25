// router.revalidate() must show the fresh data in the LEAF page, not only
// refresh `_loaderData` — the mutation-then-refresh flow (a server action
// followed by revalidate) was once a silent no-op in the DOM. The key is
// unchanged, so the page stays mounted and `useLoaderData()` (an accessor)
// delivers the new data in place (#4814).
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { createRouter, RouterProvider, RouterView, useLoaderData } from '../index'
import type { RouteRecord } from '../types'

describe('router.revalidate() re-renders the leaf', () => {
  it('a leaf page reading useLoaderData() shows the fresh data', async () => {
    let version = 0
    const Page = () => {
      const data = useLoaderData<{ version: number }>()
      return h('p', { id: 'v' }, () => `v${data().version}`)
    }
    const routes: RouteRecord[] = [
      { path: '/', component: () => null },
      { path: '/posts', component: Page, loader: async () => ({ version: ++version }) },
    ]
    const router = createRouter({ routes, url: '/' })
    await router.push('/posts')
    const ctr = document.createElement('div')
    const dispose = mount(h(RouterProvider, { router }, h(RouterView, {})), ctr)
    expect(ctr.querySelector('#v')?.textContent).toBe('v1')

    await router.revalidate()
    expect(ctr.querySelector('#v')?.textContent).toBe('v2')
    dispose()
    router.destroy()
  })
})
