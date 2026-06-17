/**
 * Query-time heading-anchor deep links.
 *
 * The page is the single searchable unit; each result carries its heading
 * anchors so the runtime can jump a hit to the exact section without paying
 * the ~4× index cost of one document per section. These tests lock the two
 * halves of that contract:
 *   - build side: `buildPageSearchEntry` stores `{ t, s }` anchors (lowercased
 *     text + slug), omitting empty-slug headings + omitting the field entirely
 *     when a page has none.
 *   - serialize side: `makeSearchDoc` carries anchors onto the stored doc.
 *   - runtime side: `resultDeepLink` picks the heading with the most matched
 *     terms and appends `#slug`, falling back to the page URL when nothing
 *     matches.
 */
import { describe, expect, it } from 'vitest'
import { buildPageSearchEntry } from '../plugin'
import { makeSearchDoc } from '../search/index-builder'
import { resultDeepLink } from '../search/search-runtime'
import type { Heading } from '../types'

const H = (text: string, slug = text.toLowerCase().replace(/\s+/g, '-')): Heading => ({
  level: 2,
  text,
  slug,
})

describe('buildPageSearchEntry — anchor extraction', () => {
  it('stores lowercased heading text + slug as anchors', () => {
    const entry = buildPageSearchEntry({
      collectionName: 'docs',
      pageSlug: 'router',
      title: 'Router',
      description: 'Routing',
      source: '## Keyed Lists\nbody\n## SSR\nmore',
      headings: [H('Keyed Lists'), H('SSR')],
      bodyMax: 1500,
    })
    expect(entry.url).toBe('/docs/router')
    expect(entry.anchors).toEqual([
      { t: 'keyed lists', s: 'keyed-lists' },
      { t: 'ssr', s: 'ssr' },
    ])
  })

  it('omits headings with an empty slug', () => {
    const entry = buildPageSearchEntry({
      collectionName: 'docs',
      pageSlug: 'x',
      title: 'X',
      description: undefined,
      source: 'body',
      headings: [H('Real', 'real'), { level: 2, text: 'No Anchor', slug: '' }],
      bodyMax: 1500,
    })
    expect(entry.anchors).toEqual([{ t: 'real', s: 'real' }])
  })

  it('omits the anchors field entirely for a page with no headings', () => {
    const entry = buildPageSearchEntry({
      collectionName: 'docs',
      pageSlug: 'flat',
      title: 'Flat',
      description: undefined,
      source: 'just a paragraph',
      headings: [],
      bodyMax: 1500,
    })
    expect(entry.anchors).toBeUndefined()
  })
})

describe('makeSearchDoc — anchors flow onto the stored doc', () => {
  it('carries non-empty anchors', () => {
    const doc = makeSearchDoc('docs', {
      slug: 'router',
      title: 'Router',
      headings: ['Keyed Lists'],
      body: 'b',
      anchors: [{ t: 'keyed lists', s: 'keyed-lists' }],
    })
    expect(doc.anchors).toEqual([{ t: 'keyed lists', s: 'keyed-lists' }])
  })

  it('omits anchors when absent or empty', () => {
    const noField = makeSearchDoc('docs', {
      slug: 'a',
      title: 'A',
      headings: [],
      body: 'b',
    })
    expect(noField.anchors).toBeUndefined()
    const emptyField = makeSearchDoc('docs', {
      slug: 'a',
      title: 'A',
      headings: [],
      body: 'b',
      anchors: [],
    })
    expect(emptyField.anchors).toBeUndefined()
  })
})

describe('resultDeepLink — query-time anchor selection', () => {
  const anchors = [
    { t: 'keyed lists', s: 'keyed-lists' },
    { t: 'server-side rendering', s: 'ssr' },
  ]

  it('appends the slug of the heading containing the most matched terms', () => {
    expect(resultDeepLink('/docs/router', anchors, ['keyed'])).toBe(
      '/docs/router#keyed-lists',
    )
    expect(resultDeepLink('/docs/router', anchors, ['server', 'rendering'])).toBe(
      '/docs/router#ssr',
    )
  })

  it('falls back to the page URL when no heading contains a matched term', () => {
    // A body- or title-only match: nothing in any heading.
    expect(resultDeepLink('/docs/router', anchors, ['reconciler'])).toBe(
      '/docs/router',
    )
  })

  it('falls back to the page URL when there are no anchors or no matched terms', () => {
    expect(resultDeepLink('/docs/x', undefined, ['anything'])).toBe('/docs/x')
    expect(resultDeepLink('/docs/x', [], ['anything'])).toBe('/docs/x')
    expect(resultDeepLink('/docs/x', anchors, [])).toBe('/docs/x')
  })

  it('breaks ties by first heading (stable)', () => {
    const tie = [
      { t: 'alpha section', s: 'alpha' },
      { t: 'alpha again', s: 'alpha-again' },
    ]
    expect(resultDeepLink('/docs/x', tie, ['alpha'])).toBe('/docs/x#alpha')
  })
})
