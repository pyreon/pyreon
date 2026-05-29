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
      h(HeadProvider, null, h(Page, { setup: () => useHead({ title: 'Hello Browser' }) })),
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

  it('htmlAttrs / bodyAttrs are written to <html> and <body>', () => {
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, {
          setup: () =>
            useHead({
              htmlAttrs: { lang: 'en', dir: 'ltr' },
              bodyAttrs: { class: 'theme-dark' },
            }),
        }),
      ),
    )
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
    expect(document.body.getAttribute('class')).toBe('theme-dark')
    unmount()
    // After unmount the helpers remove the contributed attrs.
    expect(document.documentElement.getAttribute('lang')).toBeNull()
  })

  it('titleTemplate wraps the resolved title', () => {
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, {
          setup: () => useHead({ title: 'Dashboard', titleTemplate: '%s | MyApp' }),
        }),
      ),
    )
    expect(document.title).toBe('Dashboard | MyApp')
    unmount()
  })

  it('jsonLd convenience emits a <script type="application/ld+json"> with stringified content', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Pyreon' }
    const { unmount } = mountInBrowser(
      h(HeadProvider, null, h(Page, { setup: () => useHead({ jsonLd: ld }) })),
    )
    const script = document.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    )
    expect(script).not.toBeNull()
    expect(JSON.parse(script!.textContent ?? '{}')).toEqual(ld)
    unmount()
  })

  it('innermost useHead wins when multiple components contribute the same key', async () => {
    const Inner = () => {
      useHead({ title: 'Inner Wins' })
      return h('div', { id: 'inner' }, 'inner')
    }
    const Outer = () => {
      useHead({ title: 'Outer Loses' })
      return h('div', { id: 'outer' }, h(Inner, {}))
    }
    const { unmount } = mountInBrowser(h(HeadProvider, null, h(Outer, {})))
    await flush()
    // Innermost component's title takes precedence.
    expect(document.title).toBe('Inner Wins')
    unmount()
  })

  it('script tags inserted with src + async + defer attributes', () => {
    const { unmount } = mountInBrowser(
      h(
        HeadProvider,
        null,
        h(Page, {
          setup: () =>
            useHead({
              script: [{ src: 'https://example.com/analytics.js', async: '', defer: '' }],
            }),
        }),
      ),
    )
    const s = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://example.com/analytics.js"]',
    )
    expect(s).not.toBeNull()
    expect(s?.async).toBe(true)
    expect(s?.defer).toBe(true)
    unmount()
  })

  // E12 — Speculation Rules. Kill-criterion #2: real Chromium must PARSE
  // and ACCEPT the emitted block. happy-dom can't validate this — only a
  // real browser runs the Speculation Rules parser and emits a console
  // error on a malformed block. We assert: (a) the script lands in <head>
  // with the exact type, (b) its body is valid JSON, (c) the browser
  // raises NO "speculation rules" parse error, (d) HTMLScriptElement
  // recognises the type. Whether Chromium then prefetches/prerenders is
  // browser-discretionary (heuristic + headless-flag dependent) and is
  // intentionally NOT asserted — the framework's contract is "emit a
  // correct, valid declarative hint", same as `<link rel=prefetch>`.
  it('emits a real <script type="speculationrules"> Chromium parses without error', () => {
    const specErrors: string[] = []
    const origErr = console.error
    console.error = (...a: unknown[]) => {
      const msg = a.map(String).join(' ')
      if (/speculation\s*rules/i.test(msg)) specErrors.push(msg)
    }
    try {
      const { unmount } = mountInBrowser(
        h(
          HeadProvider,
          null,
          h(Page, {
            setup: () =>
              useHead({
                speculationRules: {
                  prefetch: [
                    {
                      source: 'document',
                      where: { selector_matches: 'a[data-spec]' },
                      eagerness: 'moderate',
                    },
                  ],
                  prerender: [{ source: 'list', urls: ['/about'], eagerness: 'conservative' }],
                },
              }),
          }),
        ),
      )
      const el = document.head.querySelector<HTMLScriptElement>('script[type="speculationrules"]')
      expect(el).not.toBeNull()
      // (b) body is valid JSON and round-trips.
      const parsed = JSON.parse(el?.textContent ?? '')
      expect(parsed.prerender[0].urls).toEqual(['/about'])
      expect(parsed.prefetch[0].where).toEqual({ selector_matches: 'a[data-spec]' })
      // (d) real HTMLScriptElement carries the exact type the spec requires.
      expect(el?.type).toBe('speculationrules')
      // (c) Chromium parsed it WITHOUT raising a speculation-rules error.
      expect(specErrors).toEqual([])
      unmount()
    } finally {
      console.error = origErr
    }
  })
})
