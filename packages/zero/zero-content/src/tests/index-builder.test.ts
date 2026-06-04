/**
 * Search index builder — build-time emission tests. Uses workspace-local
 * tmp dirs (Bun dynamic-import constraint).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildIndexJson,
  buildSearchIndex,
  humanBytes,
  isSearchable,
  makeSearchDoc,
  stripMarkdown,
  type CollectionEntryForIndex,
} from '../search/index-builder'

const WORKSPACE_TMP_ROOT = path.join(
  process.cwd(),
  'src',
  'tests',
  '__tmp__',
)

describe('isSearchable', () => {
  it('defaults to true for type=pages', () => {
    expect(isSearchable({ type: 'pages', schema: {} })).toBe(true)
  })

  it('defaults to false for type=data', () => {
    expect(isSearchable({ type: 'data', schema: {} })).toBe(false)
  })

  it('explicit searchable=true overrides type=data default', () => {
    expect(isSearchable({ type: 'data', schema: {}, searchable: true })).toBe(
      true,
    )
  })

  it('explicit searchable=false overrides type=pages default', () => {
    expect(isSearchable({ type: 'pages', schema: {}, searchable: false })).toBe(
      false,
    )
  })
})

describe('makeSearchDoc', () => {
  it('builds an id from collection:slug', () => {
    const doc = makeSearchDoc('docs', {
      slug: 'zero',
      title: 'Zero',
      headings: ['Intro'],
      body: 'lorem',
    })
    expect(doc.id).toBe('docs:zero')
  })

  it('defaults the URL to /<collection>/<slug>', () => {
    const doc = makeSearchDoc('docs', {
      slug: 'zero',
      title: 'Zero',
      headings: [],
      body: '',
    })
    expect(doc.url).toBe('/docs/zero')
  })

  it('respects an explicit URL', () => {
    const doc = makeSearchDoc('docs', {
      slug: 'zero',
      title: 'Zero',
      headings: [],
      body: '',
      url: '/custom/path',
    })
    expect(doc.url).toBe('/custom/path')
  })

  it('joins headings with a space', () => {
    const doc = makeSearchDoc('docs', {
      slug: 'x',
      title: 'X',
      headings: ['One', 'Two', 'Three'],
      body: '',
    })
    expect(doc.headings).toBe('One Two Three')
  })

  it('omits description when not provided (exactOptionalPropertyTypes)', () => {
    const doc = makeSearchDoc('docs', {
      slug: 'x',
      title: 'X',
      headings: [],
      body: '',
    })
    expect(doc.description).toBeUndefined()
  })
})

describe('buildIndexJson', () => {
  it('produces a JSON-serialisable string with the documents', () => {
    const json = buildIndexJson([
      {
        id: 'docs:zero',
        collection: 'docs',
        slug: 'zero',
        title: 'Zero',
        headings: 'Intro',
        body: 'lorem',
        url: '/docs/zero',
      },
    ])
    const parsed = JSON.parse(json)
    expect(parsed).toHaveProperty('docs')
    expect(parsed.docs).toHaveLength(1)
    expect(parsed.docs[0].id).toBe('docs:zero')
  })
})

describe('humanBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.00 MB'],
    [1024 * 1024 * 2.5, '2.50 MB'],
  ])('humanBytes(%j) === %j', (input, expected) => {
    expect(humanBytes(input)).toBe(expected)
  })
})

describe('stripMarkdown', () => {
  it('removes fenced code blocks', () => {
    const out = stripMarkdown('hi\n```ts\nconst x = 1\n```\nbye')
    expect(out).not.toContain('const x')
    expect(out).toContain('hi')
    expect(out).toContain('bye')
  })

  it('removes inline code', () => {
    expect(stripMarkdown('use `signal()` for')).not.toContain('signal()')
  })

  it('removes HTML tags', () => {
    expect(stripMarkdown('text <span>here</span>')).not.toContain('<span>')
  })

  it('keeps link text, drops URL', () => {
    expect(stripMarkdown('see [the docs](/x) now')).toBe('see the docs now')
  })

  it('removes heading markers but keeps the text', () => {
    expect(stripMarkdown('## Heading')).toBe('Heading')
  })

  it('removes emphasis markers', () => {
    expect(stripMarkdown('this is **bold** and *italic*')).toBe(
      'this is bold and italic',
    )
  })

  it('collapses whitespace', () => {
    expect(stripMarkdown('a   b\n\nc')).toBe('a b c')
  })
})

describe('buildSearchIndex', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(WORKSPACE_TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(WORKSPACE_TMP_ROOT, 'search-build-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeEntries(count: number): CollectionEntryForIndex[] {
    return Array.from({ length: count }, (_, i) => ({
      slug: `entry-${i}`,
      title: `Entry ${i}`,
      headings: ['Section A', 'Section B'],
      body: `body content ${i}`.repeat(100),
    }))
  }

  it('emits one chunk per searchable collection + a catalog', async () => {
    const result = await buildSearchIndex({
      config: {
        collections: {
          docs: { type: 'pages', schema: {} },
          blog: { type: 'data', schema: {}, searchable: true },
        },
      },
      entries: {
        docs: makeEntries(3),
        blog: makeEntries(2),
      },
      root: tmpDir,
      outDir: tmpDir,
    })
    expect(result.files).toHaveProperty('docs')
    expect(result.files).toHaveProperty('blog')
    expect(result.files).toHaveProperty('__main__')
    expect(result.warnings).toEqual([])

    // Catalog content sanity check.
    const catalog = JSON.parse(
      await fs.readFile(result.files.__main__!, 'utf8'),
    )
    expect(catalog.collections).toHaveLength(2)
    expect(catalog.collections.map((c: { name: string }) => c.name).sort()).toEqual(
      ['blog', 'docs'],
    )
  })

  it('skips non-searchable collections', async () => {
    const result = await buildSearchIndex({
      config: {
        collections: {
          docs: { type: 'pages', schema: {} },
          blog: { type: 'data', schema: {} },
        },
      },
      entries: {
        docs: makeEntries(2),
        blog: makeEntries(2),
      },
      root: tmpDir,
      outDir: tmpDir,
    })
    expect(result.files).toHaveProperty('docs')
    expect(result.files).not.toHaveProperty('blog')
  })

  it('skips collections with zero entries', async () => {
    const result = await buildSearchIndex({
      config: {
        collections: { docs: { type: 'pages', schema: {} } },
      },
      entries: { docs: [] },
      root: tmpDir,
      outDir: tmpDir,
    })
    expect(result.files).not.toHaveProperty('docs')
    // No catalog emitted when no collections produced output.
    expect(result.files).not.toHaveProperty('__main__')
  })

  it('warns when a chunk exceeds chunkWarnBytes', async () => {
    const result = await buildSearchIndex({
      config: { collections: { docs: { type: 'pages', schema: {} } } },
      entries: { docs: makeEntries(20) },
      root: tmpDir,
      outDir: tmpDir,
      chunkWarnBytes: 1024,
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('docs')
  })

  it('throws when a chunk exceeds chunkErrorBytes', async () => {
    await expect(
      buildSearchIndex({
        config: { collections: { docs: { type: 'pages', schema: {} } } },
        entries: { docs: makeEntries(20) },
        root: tmpDir,
        outDir: tmpDir,
        chunkErrorBytes: 1024,
      }),
    ).rejects.toThrow('exceeds chunkErrorBytes')
  })
})
