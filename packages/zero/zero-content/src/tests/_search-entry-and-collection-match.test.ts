/**
 * What goes INTO the search index, and which collection a file belongs to.
 *
 * Both are silent when wrong. A body capped mid-word leaves a truncated
 * token that minisearch indexes as a real word, so searching for it
 * finds a page and searching for the actual word does not. A file
 * attributed to the wrong collection lands under the wrong URL prefix,
 * so every search result for it 404s — while the page itself renders
 * perfectly.
 *
 * The nesting rule in `findCollectionForFileImpl` is the interesting
 * part. Collections routinely nest (`src/content` holding `docs` and
 * `src/content/docs/api` being its own collection), and the resolver
 * picks the LONGEST matching root. Picking the first match instead would
 * file every API page under `docs`, which is exactly the wrong-URL
 * failure above — and which config-key order it lands on would depend on
 * how the author happened to write their config.
 */
import { describe, expect, it } from 'vitest'
import { buildPageSearchEntry, findCollectionForFileImpl } from '../plugin'

const heading = (text: string, slug = text.toLowerCase()) =>
  ({ text, slug, depth: 2 }) as never

const entry = (over: Partial<Parameters<typeof buildPageSearchEntry>[0]> = {}) =>
  buildPageSearchEntry({
    collectionName: 'docs',
    pageSlug: 'intro',
    title: 'Intro',
    description: undefined,
    source: 'body text',
    headings: [],
    bodyMax: 1000,
    ...over,
  })

describe('a search entry carries what the runtime queries', () => {
  it('builds the canonical shape', () => {
    // The control.
    const e = entry({ headings: [heading('Setup')] })
    expect(e.slug).toBe('intro')
    expect(e.title).toBe('Intro')
    expect(e.url).toBe('/docs/intro')
    expect(e.headings).toEqual(['Setup'])
  })

  it('LOWERCASES anchor text, because the runtime matches lowercased terms', () => {
    // The query is lowercased before `.includes()`. A capitalised anchor
    // never matches, so deep-linking silently stops working for every
    // heading with a capital in it — i.e. all of them.
    const e = entry({ headings: [heading('Getting Started', 'getting-started')] })
    expect(e.anchors).toEqual([{ t: 'getting started', s: 'getting-started' }])
  })

  it('drops a heading with no slug rather than emitting an empty anchor', () => {
    // An anchor with `s: ''` links to the top of the page, which reads
    // as the deep link being broken rather than absent.
    const e = entry({ headings: [heading('No Slug', ''), heading('Real', 'real')] })
    expect(e.anchors).toEqual([{ t: 'real', s: 'real' }])
  })

  it('omits the anchors key entirely when there are none', () => {
    // An empty array ships bytes in every index entry on the site.
    expect('anchors' in entry()).toBe(false)
  })

  it('omits description when it is undefined, and keeps an EMPTY one', () => {
    // `undefined` means "no frontmatter description"; `''` means the
    // author wrote one and left it blank. Collapsing them loses the
    // distinction the schema draws.
    expect('description' in entry()).toBe(false)
    expect(entry({ description: '' }).description).toBe('')
  })

  it('strips markdown from the indexed body', () => {
    // Indexing `**bold**` makes searching for `bold` miss and searching
    // for `**bold**` hit — the opposite of what a reader types.
    const e = entry({ source: '# Title\n\nSome **bold** and `code` and [a link](/x).' })
    expect(e.body).not.toContain('**')
    expect(e.body).not.toContain('](/x)')
    expect(e.body).toContain('bold')
  })
})

describe('the body cap breaks on a word boundary when it can', () => {
  it('leaves a short body untouched', () => {
    expect(entry({ source: 'short', bodyMax: 100 }).body).toBe('short')
  })

  it('breaks at the last SPACE when one is late enough', () => {
    // A cut mid-word leaves a fragment minisearch indexes as a real
    // token, so it matches a query nobody would type and misses the one
    // they would.
    const e = entry({ source: 'alpha beta gamma delta', bodyMax: 16 })
    expect(e.body).toBe('alpha beta gamma')
    expect(e.body.length).toBeLessThanOrEqual(16)
  })

  it('takes the HARD cut when the last space is too early', () => {
    // One enormous token — a URL, a minified blob. Backing up to a space
    // at 10% of the budget would throw away almost the whole body.
    const e = entry({ source: `x ${'y'.repeat(200)}`, bodyMax: 100 })
    expect(e.body.length).toBe(100)
    expect(e.body.startsWith('x ')).toBe(true)
  })

  it('takes the hard cut when there is no space at all', () => {
    const e = entry({ source: 'z'.repeat(200), bodyMax: 50 })
    expect(e.body.length).toBe(50)
  })

  it('handles a zero cap without throwing', () => {
    expect(entry({ source: 'text', bodyMax: 0 }).body).toBe('')
  })
})

describe('a file is attributed to the MOST SPECIFIC collection', () => {
  const collections = {
    docs: { path: 'src/content/docs' },
    api: { path: 'src/content/docs/api' },
    blog: { path: 'src/content/blog' },
  }
  const find = (id: string) => findCollectionForFileImpl(id, collections, '/proj')

  it('matches a file inside a collection root', () => {
    // The control.
    expect(find('/proj/src/content/docs/intro.md')).toBe('docs')
    expect(find('/proj/src/content/blog/post.md')).toBe('blog')
  })

  it('prefers the NESTED collection over its parent', () => {
    // Nested collections are ordinary. Taking the first match instead
    // files every API page under `docs`, so its search results carry a
    // `/docs/…` URL that 404s — while the page renders fine.
    expect(find('/proj/src/content/docs/api/client.md')).toBe('api')
  })

  it('is independent of config KEY ORDER', () => {
    // Otherwise the answer depends on how the author happened to write
    // their config object.
    const reversed = { api: collections.api, blog: collections.blog, docs: collections.docs }
    expect(findCollectionForFileImpl('/proj/src/content/docs/api/x.md', reversed, '/proj')).toBe('api')
  })

  it('returns null for a file outside every collection', () => {
    // A component under `src/` that happens to be `.md`. Attributing it
    // to a collection puts it in the search index and the sitemap.
    expect(find('/proj/src/components/README.md')).toBeNull()
    expect(find('/elsewhere/notes.md')).toBeNull()
  })

  it('does not match a SIBLING whose name is a prefix', () => {
    // `src/content/docs-old` must not match the `docs` root. A naive
    // `startsWith` on the path string does exactly that.
    expect(find('/proj/src/content/docs-old/legacy.md')).toBeNull()
  })

  it('defaults an omitted path to src/content/<name>', () => {
    expect(findCollectionForFileImpl(
      '/proj/src/content/guides/a.md', { guides: {} }, '/proj',
    )).toBe('guides')
  })

  it('honours an ABSOLUTE collection path', () => {
    // A monorepo pointing a collection outside the Vite root.
    expect(findCollectionForFileImpl(
      '/shared/content/x.md', { shared: { path: '/shared/content' } }, '/proj',
    )).toBe('shared')
  })

  it('returns null when there are no collections', () => {
    expect(findCollectionForFileImpl('/proj/a.md', {}, '/proj')).toBeNull()
  })
})
