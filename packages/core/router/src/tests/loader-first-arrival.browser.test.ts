import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { createRouter, RouterProvider, RouterView, useLoaderData } from '../index'

for (const errorComponent of [undefined, () => h('p', null, 'Loader error')]) {
  it(`renders the first loader result without a pending component (error fallback: ${!!errorComponent})`, async () => {
    let resolve!: (data: { title: string }) => void
    const data = new Promise<{ title: string }>((done) => { resolve = done })
    const router = createRouter({
      mode: 'hash', url: '/loaded',
      routes: [{
        path: '/loaded',
        loader: () => data,
        ...(errorComponent ? { errorComponent } : {}),
        component: () => h('h1', null, useLoaderData<{ title: string }>()?.title ?? 'Waiting'),
      }],
    })
    const { container, unmount } = mountInBrowser(h(RouterProvider, { router }, h(RouterView, null)))
    try {
      const load = router.replace('/loaded')
      await expect.poll(() => container.textContent).toBe(errorComponent ? 'Loader error' : 'Waiting')
      resolve({ title: 'First result' })
      await load
      await expect.poll(() => container.querySelector('h1')?.textContent).toBe('First result')
    } finally {
      unmount()
      router.destroy()
    }
  })
}
