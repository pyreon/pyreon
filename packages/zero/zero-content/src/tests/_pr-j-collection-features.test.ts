// PR-J — collection features (audit M13+M14+M15+H10+H3+L7)
//
// Six independent audit items, one PR:
//
//  - M13 — draft filter on `getCollection`. Default-on in production,
//          default-off in dev so authors preview WIP. Opt-in
//          override via `{ includeDrafts: true | false }`.
//
//  - M14 — `reference(collection, slug)` typed helper + runtime
//          resolvers (`resolveReference` / `resolveReferences`).
//
//  - M15 — schema-shape coverage for `draft` / `publishDate` /
//          `updatedDate` is documented as a convention; the runtime
//          honors them where applicable (M13 reads `draft`).
//
//  - H10 — longest-prefix collection lookup. Nested collection paths
//          (`src/content/docs` AND `src/content/docs/api`) now route
//          each file to the deeper collection.
//
//  - H3 — h1-h6 heading capture (pre-fix: h2-h3 only).
//
//  - L7 — heading slug dedup. Two headings with the same slugified
//         text get `-2`, `-3` suffixes — both for the `<h*>` id and
//         the captured `slug` field.

import { describe, expect, it } from 'vitest'
import {
  _resetRegistryForTesting,
  _setRegistry,
  getCollection,
  isReference,
  reference,
  resolveReference,
  resolveReferences,
  type CollectionRegistry,
  type CollectionRuntime,
} from '../index'
import { compileMarkdown } from '../pipeline/parse'
import { dedupeSlug } from '../pipeline/emit-jsx'
import { findCollectionForFileImpl } from '../plugin'

// Helper — build a stub registry matching the CollectionRegistry shape.
function buildRegistry(
  collections: Record<
    string,
    Array<{
      slug: string
      frontmatter: Record<string, unknown>
    }>
  >,
): CollectionRegistry {
  const registry: CollectionRegistry = {}
  for (const [name, entries] of Object.entries(collections)) {
    const loaders: CollectionRuntime['loaders'] = {}
    for (const entry of entries) {
      loaders[entry.slug] = async () => ({
        slug: entry.slug,
        frontmatter: entry.frontmatter,
        headings: [],
        default: () => null,
      })
    }
    registry[name] = { loaders }
  }
  return registry
}

describe('PR-J — M13 — draft filter on getCollection', () => {
  it('excludes drafts when includeDrafts=false', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        posts: [
          { slug: 'live', frontmatter: { title: 'Live' } },
          { slug: 'wip', frontmatter: { title: 'WIP', draft: true } },
        ],
      }),
    )
    const result = await getCollection('posts', { includeDrafts: false })
    expect(result.map((e) => e.slug)).toEqual(['live'])
  })

  it('includes drafts when includeDrafts=true', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        posts: [
          { slug: 'live', frontmatter: { title: 'Live' } },
          { slug: 'wip', frontmatter: { title: 'WIP', draft: true } },
        ],
      }),
    )
    const result = await getCollection('posts', { includeDrafts: true })
    expect(result.map((e) => e.slug).sort()).toEqual(['live', 'wip'])
  })

  it('non-draft entries pass through when frontmatter lacks the field', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        posts: [
          { slug: 'a', frontmatter: { title: 'A' } },
          { slug: 'b', frontmatter: { title: 'B' } },
        ],
      }),
    )
    const result = await getCollection('posts', { includeDrafts: false })
    expect(result).toHaveLength(2)
  })

  it('combines with a user-supplied filter predicate', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        posts: [
          { slug: 'a', frontmatter: { title: 'A', tag: 'pyreon' } },
          { slug: 'b', frontmatter: { title: 'B', tag: 'other' } },
          { slug: 'c', frontmatter: { title: 'C', tag: 'pyreon', draft: true } },
        ],
      }),
    )
    const result = await getCollection('posts', {
      includeDrafts: false,
      filter: (e) => e.data['tag'] === 'pyreon',
    })
    expect(result.map((e) => e.slug)).toEqual(['a'])
  })
})

describe('PR-J — M14 — reference + resolveReference', () => {
  it('reference() returns a branded plain object', () => {
    const ref = reference('authors', 'jdoe')
    expect(ref).toEqual({
      __pyreonReference: true,
      collection: 'authors',
      slug: 'jdoe',
    })
  })

  it('isReference type guard', () => {
    expect(isReference(reference('a', 'b'))).toBe(true)
    expect(isReference({ collection: 'a', slug: 'b' })).toBe(false)
    expect(isReference(null)).toBe(false)
    expect(isReference('a string')).toBe(false)
  })

  it('resolveReference looks up the target entry', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        authors: [
          {
            slug: 'jdoe',
            frontmatter: { name: 'Jane Doe', bio: 'Author bio' },
          },
        ],
      }),
    )
    const ref = reference('authors', 'jdoe')
    const entry = await resolveReference(ref)
    expect(entry).toBeDefined()
    expect(entry!.data['name']).toBe('Jane Doe')
  })

  it('resolveReference returns undefined for an unknown target', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        authors: [{ slug: 'jdoe', frontmatter: { name: 'Jane' } }],
      }),
    )
    const ref = reference('authors', 'missing')
    const entry = await resolveReference(ref)
    expect(entry).toBeUndefined()
  })

  it('resolveReferences filters missing entries', async () => {
    _resetRegistryForTesting()
    _setRegistry(
      buildRegistry({
        authors: [
          { slug: 'a', frontmatter: { name: 'A' } },
          { slug: 'b', frontmatter: { name: 'B' } },
        ],
      }),
    )
    const result = await resolveReferences([
      reference('authors', 'a'),
      reference('authors', 'missing'),
      reference('authors', 'b'),
    ])
    expect(result.map((e) => e.slug)).toEqual(['a', 'b'])
  })
})

describe('PR-J — H10 — longest-prefix collection lookup', () => {
  it('matches a single collection when no nesting', () => {
    const result = findCollectionForFileImpl(
      '/root/src/content/docs/intro.md',
      { docs: { path: 'src/content/docs' } },
      '/root',
    )
    expect(result).toBe('docs')
  })

  it('picks the LONGER prefix when two collections nest', () => {
    // `/root/src/content/docs/api/foo.md` matches BOTH `docs` and
    // `docs-api`. Pre-fix behavior depended on iteration order;
    // post-fix the deeper collection always wins.
    const result = findCollectionForFileImpl(
      '/root/src/content/docs/api/foo.md',
      {
        docs: { path: 'src/content/docs' },
        'docs-api': { path: 'src/content/docs/api' },
      },
      '/root',
    )
    expect(result).toBe('docs-api')
  })

  it('picks the longer prefix regardless of declaration order', () => {
    // Same fixture as above but declared in the reverse order — must
    // still produce the same answer.
    const result = findCollectionForFileImpl(
      '/root/src/content/docs/api/foo.md',
      {
        'docs-api': { path: 'src/content/docs/api' },
        docs: { path: 'src/content/docs' },
      },
      '/root',
    )
    expect(result).toBe('docs-api')
  })

  it('returns null when no collection contains the file', () => {
    const result = findCollectionForFileImpl(
      '/root/src/other/thing.md',
      { docs: { path: 'src/content/docs' } },
      '/root',
    )
    expect(result).toBeNull()
  })

  it('honors absolute collection paths', () => {
    const result = findCollectionForFileImpl(
      '/abs/content/docs/x.md',
      { docs: { path: '/abs/content/docs' } },
      '/root',
    )
    expect(result).toBe('docs')
  })

  it('uses the default `src/content/<name>` path when no path is set', () => {
    const result = findCollectionForFileImpl(
      '/root/src/content/blog/post.md',
      { blog: {} },
      '/root',
    )
    expect(result).toBe('blog')
  })
})

describe('PR-J — H3 — h1-h6 heading capture', () => {
  it('captures every level from 2 through 6 by default', async () => {
    const md = `# h1
## h2
### h3
#### h4
##### h5
###### h6
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.headings.map((h) => h.level)).toEqual([2, 3, 4, 5, 6])
  })

  it('drops h1 (the page title) from the captured set', async () => {
    const md = `# Page Title

## Section
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.headings.map((h) => h.level)).toEqual([2])
  })
})

describe('PR-J — L7 — heading slug dedup', () => {
  it.each([
    ['hello', new Set<string>(), 'hello'],
    ['hello', new Set<string>(['hello']), 'hello-2'],
    ['hello', new Set<string>(['hello', 'hello-2']), 'hello-3'],
    ['hello', new Set<string>(['hello', 'hello-2', 'hello-3']), 'hello-4'],
    ['', new Set<string>(), ''],
    ['', new Set<string>(['']), ''], // empty slug is not deduped
  ])('dedupeSlug(%j, %j) → %j', (base, used, expected) => {
    expect(dedupeSlug(base, used)).toBe(expected)
  })

  it('emits unique anchor ids when two headings share the same text', async () => {
    const md = `## Examples

text

## Examples
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.headings).toHaveLength(2)
    expect(result.headings[0]!.slug).toBe('examples')
    expect(result.headings[1]!.slug).toBe('examples-2')
    // The rendered <h2> id attributes should also be deduped.
    expect(result.code).toContain('id={"examples"}')
    expect(result.code).toContain('id={"examples-2"}')
  })

  it('three+ collisions get sequential suffixes', async () => {
    const md = `## API

## API

## API
`
    const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
    expect(result.headings.map((h) => h.slug)).toEqual(['api', 'api-2', 'api-3'])
  })
})
