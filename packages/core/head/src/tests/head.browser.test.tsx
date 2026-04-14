import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { HeadProvider } from '../provider'
import { useHead } from '../use-head'

// Real-Chromium smoke suite for @pyreon/head.
//
// happy-dom mutates a fake `document.head`, but its serialization,
// attribute order, and `querySelector` semantics differ subtly from
// real browsers — and several head consumers care about exactly those
// things (favicon swap on color scheme, dedup by `name`/`property`,
// `<script type="application/ld+json">` content). This suite exercises
// the wiring under a real DOM.

const Page = (props: { setup: () => void; children?: unknown }) => {
  props.setup()
  return h('div', { id: 'page' }, 'page mounted')
}

describe('head in real browser', () => {
  afterEach(() => {
    // Clean up any tags this run added — head mutations are global.
    for (const el of document.head.querySelectorAll('[data-pyreon-head]')) {
      el.remove()
    }
    document.title = ''
  })

  it('useHead({ title }) writes document.title', () => {
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, { setup: () => useHead({ title: 'Hello Browser' }) }),
      ),
    )
    expect(document.title).toBe('Hello Browser')
    unmount()
  })

  it('useHead({ meta }) inserts a real <meta> element with attribute correctness', () => {
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, {
          setup: () =>
            useHead({
              meta: [
                { name: 'description', content: 'Pyreon framework' },
                { property: 'og:type', content: 'website' },
              ],
            }),
        }),
      ),
    )
    const desc = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
    const og = document.head.querySelector<HTMLMetaElement>('meta[property="og:type"]')

    expect(desc?.getAttribute('content')).toBe('Pyreon framework')
    expect(og?.getAttribute('content')).toBe('website')
    unmount()
  })

  it('reactive useHead getter updates the title when the signal changes', async () => {
    const counter = signal(0)
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, { setup: () => useHead(() => ({ title: `Items: ${counter()}` })) }),
      ),
    )
    expect(document.title).toBe('Items: 0')

    counter.set(7)
    await flush()
    expect(document.title).toBe('Items: 7')

    counter.set(42)
    await flush()
    expect(document.title).toBe('Items: 42')
    unmount()
  })

  it('removes head tags when the providing component unmounts', () => {
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, {
          setup: () => useHead({ link: [{ rel: 'canonical', href: 'https://example.com/x' }] }),
        }),
      ),
    )
    expect(document.head.querySelector('link[rel="canonical"]')).not.toBeNull()

    unmount()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })
})
