import { describe, expect, it } from "vitest"
import { buildMetaTags } from '../meta'

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
})
