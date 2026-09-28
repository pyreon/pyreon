/**
 * SSR → hydrate for a `lazy()` inside `<Suspense>`.
 *
 * The server used to render a still-loading lazy as NOTHING (stream: an empty
 * swap template; string: the fallback). It now waits for the chunk, so the
 * HTML carries the real content — and the client, whose chunk has loaded by
 * hydration time (zero's `startClient` preload is the documented contract),
 * must ADOPT that content rather than rebuild it.
 */
import type { ComponentFn } from '@pyreon/core'
import { h, lazy, Suspense } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot } from '../index'

const Quote: ComponentFn<{ who: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who}`)

describe('lazy() inside Suspense — SSR → hydrate', () => {
  beforeAll(() => disableHydrationWarnings())

  it('the server HTML carries the lazy content, and hydration adopts it', async () => {
    const Lazy = lazy<{ who: string }>(
      () => new Promise((r) => setTimeout(() => r({ default: Quote }), 20)),
    )
    const tree = () =>
      h('main', null, h(Suspense, { fallback: h('i', { class: 'fb' }, 'loading') }, h(Lazy, { who: 'a' })))

    // Rendered while the chunk is STILL LOADING — the case that used to lose it.
    expect(Lazy.__loading()).toBe(true)
    const html = await renderToString(tree())
    expect(html).toContain('quote:a')
    expect(html).not.toContain('loading')

    const c = document.createElement('div')
    document.body.appendChild(c)
    c.innerHTML = html
    const serverP = c.querySelector('p.q')
    expect(serverP).not.toBeNull()

    const dispose = hydrateRoot(c, tree())
    // Same node, not a rebuilt copy — and no fallback anywhere.
    expect(c.querySelector('p.q')).toBe(serverP)
    expect(c.querySelectorAll('p.q').length).toBe(1)
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.textContent).toBe('quote:a')
    dispose()
    c.remove()
  })
})
