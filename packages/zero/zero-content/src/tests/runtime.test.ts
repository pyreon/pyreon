/**
 * getCollection / getEntry / getEntries — runtime queries against the
 * plugin-emitted registry. The tests install a fake registry directly
 * via `_setRegistry` (the same hook the virtual module uses).
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  _listCollections,
  _resetRegistryForTesting,
  _setRegistry,
  getCollection,
  getEntries,
  getEntry,
} from '../runtime'

afterEach(() => _resetRegistryForTesting())

function makeRegistry() {
  return {
    docs: {
      name: 'docs',
      type: 'pages' as const,
      loaders: {
        zero: async () => ({
          default: () => null,
          frontmatter: { title: 'Zero' },
          headings: [{ level: 2, text: 'Intro', slug: 'intro' }],
          slug: 'zero',
        }),
        index: async () => ({
          default: () => null,
          frontmatter: { title: 'Home' },
          headings: [],
          slug: 'index',
        }),
      },
    },
    blog: {
      name: 'blog',
      type: 'data' as const,
      loaders: {
        'hello-world': async () => ({
          default: () => null,
          frontmatter: { title: 'Hello', author: 'Vit' },
          headings: [],
          slug: 'hello-world',
        }),
      },
    },
  }
}

describe('getCollection', () => {
  it('returns every entry from a registered collection', async () => {
    _setRegistry(makeRegistry())
    const entries = await getCollection('docs')
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.slug).sort()).toEqual(['index', 'zero'])
  })

  it('exposes data, render(), headings', async () => {
    _setRegistry(makeRegistry())
    const entries = await getCollection('docs')
    const zero = entries.find((e) => e.slug === 'zero')!
    expect(zero.data).toEqual({ title: 'Zero' })
    expect(zero.headings).toEqual([{ level: 2, text: 'Intro', slug: 'intro' }])
    const Component = await zero.render()
    expect(typeof Component).toBe('function')
  })

  it('throws when collection is not defined', async () => {
    _setRegistry(makeRegistry())
    await expect(getCollection('missing' as never)).rejects.toThrow(
      'Collection "missing" is not defined',
    )
  })

  it('throws when no registry is set', async () => {
    await expect(getCollection('docs' as never)).rejects.toThrow(
      'No content collection registry available',
    )
  })

  it('lists available collections in the error message', async () => {
    _setRegistry(makeRegistry())
    await expect(getCollection('missing' as never)).rejects.toThrow(
      'Available collections: blog, docs',
    )
  })
})

describe('getEntry', () => {
  it('returns a single entry by slug', async () => {
    _setRegistry(makeRegistry())
    const entry = await getEntry('docs', 'zero')
    expect(entry?.slug).toBe('zero')
    expect(entry?.data).toEqual({ title: 'Zero' })
  })

  it('returns undefined when collection does not exist', async () => {
    _setRegistry(makeRegistry())
    const entry = await getEntry('missing' as never, 'x')
    expect(entry).toBeUndefined()
  })

  it('returns undefined when slug does not exist', async () => {
    _setRegistry(makeRegistry())
    const entry = await getEntry('docs', 'not-here')
    expect(entry).toBeUndefined()
  })
})

describe('getEntries', () => {
  it('returns multiple entries by slug list', async () => {
    _setRegistry(makeRegistry())
    const entries = await getEntries('docs', ['zero', 'index'])
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.slug).sort()).toEqual(['index', 'zero'])
  })

  it('silently filters missing slugs', async () => {
    _setRegistry(makeRegistry())
    const entries = await getEntries('docs', ['zero', 'not-here', 'index'])
    expect(entries).toHaveLength(2)
  })

  it('returns empty when collection does not exist', async () => {
    _setRegistry(makeRegistry())
    const entries = await getEntries('missing' as never, ['x'])
    expect(entries).toEqual([])
  })
})

describe('_listCollections', () => {
  it('returns the list of registered collection names sorted', () => {
    _setRegistry(makeRegistry())
    expect(_listCollections()).toEqual(['blog', 'docs'])
  })
})

describe('runtime — defensive fallbacks', () => {
  it('uses the loader key as slug when the module has no .slug', async () => {
    _setRegistry({
      docs: {
        name: 'docs',
        type: 'pages',
        loaders: {
          'no-slug-here': async () =>
            ({
              default: () => null,
              frontmatter: {},
              // intentionally missing slug + headings
            }) as never,
        },
      },
    })
    const entry = await getEntry('docs', 'no-slug-here')
    expect(entry?.slug).toBe('no-slug-here')
    expect(entry?.headings).toEqual([])
  })

  it('returns [] headings when the loaded module has none', async () => {
    _setRegistry({
      blog: {
        name: 'blog',
        type: 'data',
        loaders: {
          x: async () =>
            ({
              default: () => null,
              frontmatter: {},
              slug: 'x',
            }) as never,
        },
      },
    })
    const entries = await getEntries('blog', ['x'])
    expect(entries[0]!.headings).toEqual([])
  })

  it('uses the loader key as slug in getCollection too', async () => {
    _setRegistry({
      docs: {
        name: 'docs',
        type: 'pages',
        loaders: {
          fallback: async () =>
            ({
              default: () => null,
              frontmatter: {},
            }) as never,
        },
      },
    })
    const entries = await getCollection('docs')
    expect(entries[0]!.slug).toBe('fallback')
    expect(entries[0]!.headings).toEqual([])
  })
})
