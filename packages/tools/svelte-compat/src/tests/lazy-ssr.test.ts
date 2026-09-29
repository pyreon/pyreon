/**
 * A `@pyreon/core` `lazy()` rendered through svelte-compat's `jsx()` is WRAPPED
 * like any other component. The wrapper forwarded `__loading` (so `<Suspense>`
 * could pick its fallback) but not `__load`, so `@pyreon/runtime-server` could
 * not see a still-loading chunk to wait for — the server rendered the
 * fallback forever instead of the content.
 */
import { h, lazy } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { Suspense } from '../index'
import { jsx } from '../jsx-runtime'

describe('svelte-compat jsx() — a lazy() reaching the compat wrapper', () => {
  it('forwards __load as well as __loading, so the server waits for the chunk', async () => {
    const L = lazy<{ who: string }>(
      () =>
        new Promise((r) =>
          setTimeout(() => r({ default: (p) => h('p', { class: 'q' }, `core:${p.who}`) }), 20),
        ),
    )
    const html = await renderToString(
      jsx(Suspense, { fallback: jsx('i', { children: 'loading' }), children: jsx(L, { who: 'k' }) }),
    )
    expect(html).toContain('<p class="q">core:k</p>')
    expect(html).not.toContain('loading')
  })
})
