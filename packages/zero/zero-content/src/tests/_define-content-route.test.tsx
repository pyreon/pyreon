/**
 * PR-A audit H1 — `defineContentRoute` helper regression specs.
 *
 * The function collapses the docs-zero Suspense + async-body
 * boilerplate into one call. Locked here so a refactor can't
 * silently change the contract.
 */
import { h } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from '@pyreon/runtime-server'

// Mock `useParams` — the helper reads the catch-all slug param via
// `useParams()`. For unit tests we don't have a live router, so we
// mock the router module + control what each spec returns.
let mockParams: { slug?: string | string[] } = {}
vi.mock('@pyreon/router', () => ({
  useParams: () => mockParams,
}))

const {
  _resetRegistryForTesting,
  _setRegistry,
  defineContentRoute,
} = await import('../index')
type CollectionRegistry =
  Awaited<ReturnType<typeof import('../runtime')._getRegistry>>

const FakeContent: ComponentFn = () =>
  h('div', { class: 'fake-content' }, 'rendered content')

function setupRegistry(slug: string): void {
  const registry: CollectionRegistry = {
    docs: {
      name: 'docs',
      type: 'pages',
      loaders: {
        [slug]: async () => ({
          default: FakeContent,
          frontmatter: { title: 'Hello' },
          headings: [{ level: 2, text: 'Section', slug: 'section' }],
          slug,
        }),
      },
    },
  }
  _setRegistry(registry)
}

describe('PR-A H1 — defineContentRoute', () => {
  beforeEach(() => {
    _resetRegistryForTesting()
  })

  it('exports a function that returns a ComponentFn', () => {
    expect(typeof defineContentRoute).toBe('function')
    const route = defineContentRoute('docs')
    expect(typeof route).toBe('function')
  })

  it('renders the resolved entry inside an article wrapper via SSR', async () => {
    setupRegistry('zero')
    mockParams = { slug: 'zero' }
    const Route = defineContentRoute('docs')
    const html = await renderToString(h(Route, null))
    expect(html).toContain('data-page-slug="zero"')
    expect(html).toContain('class="docs-content vp-doc"')
    expect(html).toContain('class="fake-content"')
    expect(html).toContain('rendered content')
  })

  it('renders the 404 component when the slug does not resolve', async () => {
    setupRegistry('zero')
    mockParams = { slug: 'missing' }
    const Route = defineContentRoute('docs')
    const html = await renderToString(h(Route, null))
    expect(html).toContain('class="docs-404"')
    expect(html).toContain('404')
    expect(html).toContain('missing')
  })

  it('honours a custom `notFound` component', async () => {
    setupRegistry('zero')
    mockParams = { slug: 'gone' }
    const CustomNotFound: ComponentFn<{ slug: string }> = (props) =>
      h('div', { class: 'custom-404' }, 'cant find ', props.slug)
    const Route = defineContentRoute('docs', { notFound: CustomNotFound })
    const html = await renderToString(h(Route, null))
    expect(html).toContain('class="custom-404"')
    expect(html).toContain('cant find gone')
    expect(html).not.toContain('docs-404')
  })

  it('passes the resolved entry + rendered body into a custom `wrap`', async () => {
    setupRegistry('zero')
    mockParams = { slug: 'zero' }
    const wrap = (entry: { data: Record<string, unknown> }, body: VNodeChild) =>
      h(
        'section',
        { class: 'wrapped', 'data-title': String(entry.data.title) },
        body,
      )
    const Route = defineContentRoute('docs', { wrap })
    const html = await renderToString(h(Route, null))
    expect(html).toContain('class="wrapped"')
    expect(html).toContain('data-title="Hello"')
    // `wrap` replaces the article wrapper — `docs-content` shouldn't
    // appear in the output.
    expect(html).not.toContain('docs-content vp-doc')
    expect(html).toContain('rendered content')
  })

  it('supports `articleClass: null` to skip the article wrapper', async () => {
    setupRegistry('zero')
    mockParams = { slug: 'zero' }
    const Route = defineContentRoute('docs', { articleClass: null })
    const html = await renderToString(h(Route, null))
    expect(html).not.toContain('<article')
    expect(html).toContain('rendered content')
  })

  it('joins array `slug` params into the lookup key (catch-all routes)', async () => {
    setupRegistry('router/loaders')
    mockParams = { slug: ['router', 'loaders'] }
    const Route = defineContentRoute('docs')
    const html = await renderToString(h(Route, null))
    // The data-page-slug attribute reflects the joined slug, which
    // matches the registry's loader key.
    expect(html).toContain('data-page-slug="router/loaders"')
    expect(html).toContain('rendered content')
  })

  it('defaults the slug to empty string when no param is set (`/<collection>/` route)', async () => {
    setupRegistry('')
    mockParams = {}
    const Route = defineContentRoute('docs')
    const html = await renderToString(h(Route, null))
    expect(html).toContain('data-page-slug=""')
    expect(html).toContain('rendered content')
  })
})

describe('defineContentRoute — useHead integration', () => {
  beforeEach(() => {
    _resetRegistryForTesting()
  })

  // The `defaultHeadFromEntry` helper is pure; this exercise locks
  // the auto-derivation shape from frontmatter (title +
  // description → <title> + meta description + og:title + og:description).
  it('defaultHeadFromEntry maps title + description from frontmatter', async () => {
    const { defaultHeadFromEntry } = await import('../route-helpers')
    const entry = {
      slug: 's',
      data: { title: 'My Page', description: 'A demo' },
      render: async () => FakeContent,
      headings: [],
    }
    const head = defaultHeadFromEntry(entry)
    expect(head.title).toBe('My Page')
    expect(head.meta).toContainEqual({ name: 'description', content: 'A demo' })
    expect(head.meta).toContainEqual({
      property: 'og:description',
      content: 'A demo',
    })
    expect(head.meta).toContainEqual({
      property: 'og:title',
      content: 'My Page',
    })
  })

  it('defaultHeadFromEntry omits title when frontmatter has no title', async () => {
    const { defaultHeadFromEntry } = await import('../route-helpers')
    const entry = {
      slug: 's',
      data: { description: 'Body only' },
      render: async () => FakeContent,
      headings: [],
    }
    const head = defaultHeadFromEntry(entry)
    expect(head.title).toBeUndefined()
    expect(head.meta).toContainEqual({
      name: 'description',
      content: 'Body only',
    })
  })

  it('defaultHeadFromEntry returns an empty input when frontmatter has neither', async () => {
    const { defaultHeadFromEntry } = await import('../route-helpers')
    const entry = {
      slug: 's',
      data: {},
      render: async () => FakeContent,
      headings: [],
    }
    const head = defaultHeadFromEntry(entry)
    expect(head.title).toBeUndefined()
    expect(head.meta).toBeUndefined()
  })

  it('head: false opts out of useHead emission entirely', async () => {
    // The contract is purely opt-out — no observable runtime effect
    // to assert beyond "no throw and the route still renders". The
    // useHead call site itself is structurally absent inside the
    // async body. This exercise locks the option exists + behaves
    // when set.
    setupRegistry('guide')
    mockParams = { slug: 'guide' }
    const Route = defineContentRoute('docs', { head: false })
    const html = await renderToString(h(Route, null))
    expect(html).toContain('rendered content')
  })

  it('custom head function receives the resolved entry', async () => {
    setupRegistry('guide')
    mockParams = { slug: 'guide' }
    const spy = vi.fn(() => ({ title: 'Custom Title' }))
    const Route = defineContentRoute('docs', { head: spy })
    const html = await renderToString(h(Route, null))
    expect(html).toContain('rendered content')
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]![0].slug).toBe('guide')
  })
})
