import { describe, expect, it, vi } from "vitest"
import { buildMetaTags } from '../meta'

// Mock @pyreon/head to capture useHead calls without requiring HeadProvider
const useHeadCalls: unknown[] = []
vi.mock('@pyreon/head', () => ({
  useHead: (input: unknown) => { useHeadCalls.push(input) },
}))

describe('buildMetaTags', () => {
  it('builds basic meta tags', () => {
    const tags = buildMetaTags({
      title: 'My Page',
      description: 'A great page',
    })

    expect(tags.meta.find((m) => m.name === 'description')?.content).toBe('A great page')
    expect(tags.meta.find((m) => m.property === 'og:title')?.content).toBe('My Page')
    expect(tags.meta.find((m) => m.name === 'twitter:title')?.content).toBe('My Page')
  })

  it('builds Open Graph tags', () => {
    const tags = buildMetaTags({
      title: 'Page',
      image: '/og.jpg',
      imageAlt: 'Preview',
      siteName: 'MySite',
      type: 'website',
    })

    expect(tags.meta.find((m) => m.property === 'og:image')?.content).toBe('/og.jpg')
    expect(tags.meta.find((m) => m.property === 'og:image:alt')?.content).toBe('Preview')
    expect(tags.meta.find((m) => m.property === 'og:site_name')?.content).toBe('MySite')
    expect(tags.meta.find((m) => m.property === 'og:type')?.content).toBe('website')
  })

  it('builds Twitter Card tags', () => {
    const tags = buildMetaTags({
      title: 'Page',
      twitterCard: 'summary',
      twitterSite: '@pyreon',
      twitterCreator: '@vitbokisch',
    })

    expect(tags.meta.find((m) => m.name === 'twitter:card')?.content).toBe('summary')
    expect(tags.meta.find((m) => m.name === 'twitter:site')?.content).toBe('@pyreon')
    expect(tags.meta.find((m) => m.name === 'twitter:creator')?.content).toBe('@vitbokisch')
  })

  it('builds canonical link', () => {
    const tags = buildMetaTags({ canonical: 'https://example.com/page' })
    expect(tags.link.find((l) => l.rel === 'canonical')?.href).toBe('https://example.com/page')
    expect(tags.meta.find((m) => m.property === 'og:url')?.content).toBe('https://example.com/page')
  })

  it('builds alternate locale links', () => {
    const tags = buildMetaTags({
      alternateLocales: [
        { locale: 'en', url: 'https://example.com/en/page' },
        { locale: 'de', url: 'https://example.com/de/page' },
      ],
    })

    const alternates = tags.link.filter((l) => l.rel === 'alternate')
    expect(alternates.length).toBe(2)
    expect(alternates[0]?.hreflang).toBe('en')
    expect(alternates[1]?.hreflang).toBe('de')
  })

  it('builds article meta', () => {
    const tags = buildMetaTags({
      type: 'article',
      publishedTime: '2026-01-15',
      author: 'Vit',
      tags: ['pyreon', 'framework'],
    })

    expect(tags.meta.find((m) => m.property === 'article:published_time')?.content).toBe('2026-01-15')
    expect(tags.meta.find((m) => m.property === 'article:author')?.content).toBe('Vit')
    const articleTags = tags.meta.filter((m) => m.property === 'article:tag')
    expect(articleTags.length).toBe(2)
  })

  it('builds JSON-LD script', () => {
    const tags = buildMetaTags({
      jsonLd: {
        '@type': 'WebSite',
        name: 'Pyreon',
        url: 'https://pyreon.dev',
      },
    })

    expect(tags.script.length).toBe(1)
    const parsed = JSON.parse(tags.script[0]!.children)
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed['@type']).toBe('WebSite')
  })

  it('includes robots meta', () => {
    const tags = buildMetaTags({ robots: 'noindex, nofollow' })
    expect(tags.meta.find((m) => m.name === 'robots')?.content).toBe('noindex, nofollow')
  })

  it('defaults to index, follow', () => {
    const tags = buildMetaTags({})
    expect(tags.meta.find((m) => m.name === 'robots')?.content).toBe('index, follow')
  })

  it('includes extra custom meta', () => {
    const tags = buildMetaTags({
      extra: [{ name: 'viewport', content: 'width=device-width' }],
    })
    expect(tags.meta.find((m) => m.name === 'viewport')?.content).toBe('width=device-width')
  })

  it('auto-generates hreflang alternates from i18n config', () => {
    const tags = buildMetaTags({
      canonical: 'https://example.com/de/about',
      origin: 'https://example.com',
      i18n: {
        locales: ['en', 'de', 'cs'],
        defaultLocale: 'en',
      },
    })

    const alternates = tags.link.filter((l) => l.rel === 'alternate')
    expect(alternates.length).toBe(4) // 3 locales + x-default

    expect(alternates.find((a) => a.hreflang === 'en')?.href).toBe('https://example.com/about')
    expect(alternates.find((a) => a.hreflang === 'de')?.href).toBe('https://example.com/de/about')
    expect(alternates.find((a) => a.hreflang === 'cs')?.href).toBe('https://example.com/cs/about')
    expect(alternates.find((a) => a.hreflang === 'x-default')?.href).toBe('https://example.com/about')
  })

  it('adds og:locale:alternate for non-current locales', () => {
    const tags = buildMetaTags({
      locale: 'de',
      origin: 'https://example.com',
      canonical: 'https://example.com/de/about',
      i18n: {
        locales: ['en', 'de'],
        defaultLocale: 'en',
      },
    })

    const ogAlternates = tags.meta.filter((m) => m.property === 'og:locale:alternate')
    expect(ogAlternates.length).toBe(1)
    expect(ogAlternates[0]?.content).toBe('en')
  })

  it('resolves OG image from ogTemplate', () => {
    const tags = buildMetaTags({
      title: 'Page',
      ogTemplate: 'default',
      locale: 'de',
    })

    const ogImage = tags.meta.find((m) => m.property === 'og:image')
    expect(ogImage?.content).toBe('/og/default-de.png')
    const twitterImage = tags.meta.find((m) => m.name === 'twitter:image')
    expect(twitterImage?.content).toBe('/og/default-de.png')
  })

  it('explicit image overrides ogTemplate', () => {
    const tags = buildMetaTags({
      title: 'Page',
      image: '/custom-og.jpg',
      ogTemplate: 'default',
      locale: 'de',
    })

    expect(tags.meta.find((m) => m.property === 'og:image')?.content).toBe('/custom-og.jpg')
  })

  it('ogTemplate without locale uses no suffix', () => {
    const tags = buildMetaTags({
      title: 'Page',
      ogTemplate: 'hero',
    })

    // Default locale is en_US — no suffix
    expect(tags.meta.find((m) => m.property === 'og:image')?.content).toBe('/og/hero.png')
  })

  it('ogTemplate respects custom dir and format', () => {
    const tags = buildMetaTags({
      title: 'Page',
      ogTemplate: 'photo',
      locale: 'fr',
      ogImageDir: 'images',
      ogImageFormat: 'jpeg',
    })

    expect(tags.meta.find((m) => m.property === 'og:image')?.content).toBe('/images/photo-fr.jpg')
  })

  it('injects favicon links when favicon config provided', () => {
    const tags = buildMetaTags({
      title: 'Page',
      favicon: { source: './icon.svg' },
    })

    expect(tags.link.some((l) => l.rel === 'icon')).toBe(true)
    expect(tags.link.some((l) => l.rel === 'apple-touch-icon')).toBe(true)
    expect(tags.link.some((l) => l.rel === 'manifest')).toBe(true)
  })

  it('injects locale-aware favicon links', () => {
    const tags = buildMetaTags({
      title: 'Page',
      locale: 'de',
      favicon: {
        source: './icon.svg',
        locales: { de: { source: './icon-de.svg' } },
      },
    })

    const svgIcon = tags.link.find((l) => l.type === 'image/svg+xml')
    expect(svgIcon?.href).toBe('/de/favicon.svg')
  })

  it('injects theme-color from favicon config', () => {
    const tags = buildMetaTags({
      title: 'Page',
      favicon: { source: './icon.svg', themeColor: '#0070f3' },
    })

    expect(tags.meta.find((m) => m.name === 'theme-color')?.content).toBe('#0070f3')
  })
})

describe('Meta component', () => {
  it('calls useHead with static title and meta tags', async () => {
    useHeadCalls.length = 0
    const { Meta } = await import('../meta')

    Meta({
      title: 'Test Page',
      description: 'A test description',
    })

    expect(useHeadCalls.length).toBe(1)
    const call = useHeadCalls[0] as { title?: string; meta?: Array<Record<string, string>> }
    expect(call.title).toBe('Test Page')
    expect(call.meta?.find((m) => m.name === 'description')?.content).toBe('A test description')
  })

  it('passes a getter to useHead when title is a reactive accessor', async () => {
    useHeadCalls.length = 0
    const { Meta } = await import('../meta')

    Meta({
      title: () => 'Dynamic Title',
    })

    expect(useHeadCalls.length).toBe(1)
    // When title is a function, Meta should pass a getter (function) to useHead
    expect(typeof useHeadCalls[0]).toBe('function')
    // Calling the getter should resolve the title
    const result = (useHeadCalls[0] as () => { title?: string })()
    expect(result.title).toBe('Dynamic Title')
  })

  it('returns children when provided', async () => {
    useHeadCalls.length = 0
    const { Meta } = await import('../meta')

    const result = Meta({ title: 'Page', children: 'child content' })
    expect(result).toBe('child content')
  })

  it('returns null when no children', async () => {
    useHeadCalls.length = 0
    const { Meta } = await import('../meta')

    const result = Meta({ title: 'Page' })
    expect(result).toBe(null)
  })
})
