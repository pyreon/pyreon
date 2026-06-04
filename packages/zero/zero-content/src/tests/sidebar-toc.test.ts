/**
 * Sidebar + Toc + frontmatter schema emission — unit tests against the
 * pure helpers. Component-render tests live in the browser smoke suite.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { groupEntries } from '../components/Sidebar'
import { filterHeadings } from '../components/Toc'
import {
  defaultPermissiveSchema,
  emitFrontmatterSchemas,
  renderVscodeSnippet,
  writeVscodeSnippetFile,
} from '../type-emit/frontmatter-schema'

const WORKSPACE_TMP_ROOT = path.join(
  process.cwd(),
  'src',
  'tests',
  '__tmp__',
)

describe('Sidebar — groupEntries', () => {
  it('returns empty when no entries', () => {
    expect(groupEntries([])).toEqual([])
  })

  it('places ungrouped entries in the empty-label first group', () => {
    const out = groupEntries([
      { title: 'A', url: '/a' },
      { title: 'B', url: '/b' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.label).toBe('')
    expect(out[0]!.items.map((i) => i.title)).toEqual(['A', 'B'])
  })

  it('sorts items by order then title within a group', () => {
    const out = groupEntries([
      { title: 'C', url: '/c' },
      { title: 'A', url: '/a', order: 2 },
      { title: 'B', url: '/b', order: 1 },
    ])
    // B (order 1), A (order 2), C (no order = Infinity)
    expect(out[0]!.items.map((i) => i.title)).toEqual(['B', 'A', 'C'])
  })

  it('groups by `group` field with the default group rendered first', () => {
    const out = groupEntries([
      { title: 'X', url: '/x', group: 'API' },
      { title: 'Y', url: '/y' },
      { title: 'Z', url: '/z', group: 'Guides' },
    ])
    expect(out.map((g) => g.label)).toEqual(['', 'API', 'Guides'])
  })

  it('sorts named groups alphabetically', () => {
    const out = groupEntries([
      { title: 'X', url: '/x', group: 'Zebra' },
      { title: 'Y', url: '/y', group: 'Alpha' },
      { title: 'Z', url: '/z', group: 'Beta' },
    ])
    expect(out.map((g) => g.label)).toEqual(['Alpha', 'Beta', 'Zebra'])
  })
})

describe('Toc — filterHeadings', () => {
  it('keeps only headings within the level range', () => {
    const out = filterHeadings(
      [
        { level: 1, text: 'h1', slug: 'h1' },
        { level: 2, text: 'h2', slug: 'h2' },
        { level: 3, text: 'h3', slug: 'h3' },
        { level: 4, text: 'h4', slug: 'h4' },
      ],
      2,
      3,
    )
    expect(out.map((h) => h.slug)).toEqual(['h2', 'h3'])
  })

  it('returns empty when no headings match', () => {
    const out = filterHeadings([{ level: 5, text: 'deep', slug: 'd' }], 2, 3)
    expect(out).toEqual([])
  })
})

describe('defaultPermissiveSchema', () => {
  it('emits a draft-07 JSON Schema requiring title', () => {
    const schema = defaultPermissiveSchema('docs') as Record<string, unknown>
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(schema.required).toEqual(['title'])
    expect((schema.properties as Record<string, unknown>).title).toBeDefined()
    expect((schema.properties as Record<string, unknown>).sidebar).toBeDefined()
  })

  it('embeds the collection name in $id + title', () => {
    const schema = defaultPermissiveSchema('blog') as Record<string, unknown>
    expect(String(schema.$id)).toContain('blog')
    expect(String(schema.title)).toContain('blog')
  })

  it('permits additional properties by default', () => {
    const schema = defaultPermissiveSchema('x') as Record<string, unknown>
    expect(schema.additionalProperties).toBe(true)
  })
})

describe('renderVscodeSnippet', () => {
  it('builds a yaml.schemas map of schema-file → glob pattern', () => {
    const out = renderVscodeSnippet([
      { collection: 'docs', file: '/abs/.pyreon/schemas/docs.json', glob: 'src/content/docs/**/*.md' },
    ])
    const parsed = JSON.parse(out)
    expect(parsed['yaml.schemas']).toEqual({
      '/abs/.pyreon/schemas/docs.json': ['src/content/docs/**/*.md'],
    })
  })

  it('groups multiple schemas correctly', () => {
    const out = renderVscodeSnippet([
      { collection: 'docs', file: '/a/docs.json', glob: 'src/content/docs/**/*.md' },
      { collection: 'blog', file: '/a/blog.json', glob: 'src/content/blog/**/*.md' },
    ])
    const parsed = JSON.parse(out)
    expect(Object.keys(parsed['yaml.schemas']).sort()).toEqual([
      '/a/blog.json',
      '/a/docs.json',
    ])
  })
})

describe('emitFrontmatterSchemas + writeVscodeSnippetFile', () => {
  let tmpDir: string

  beforeEach(async () => {
    await fs.mkdir(WORKSPACE_TMP_ROOT, { recursive: true })
    tmpDir = await fs.mkdtemp(path.join(WORKSPACE_TMP_ROOT, 'fm-schema-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('writes one schema per pages collection under .pyreon/schemas/', async () => {
    const artifacts = await emitFrontmatterSchemas({
      config: {
        collections: {
          docs: { type: 'pages', schema: {} },
          blog: { type: 'data', schema: {} },
        },
      },
      root: tmpDir,
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]!.collection).toBe('docs')
    expect(artifacts[0]!.file).toContain('schemas/docs.json')

    const content = await fs.readFile(artifacts[0]!.file, 'utf8')
    expect(JSON.parse(content).required).toEqual(['title'])
  })

  it('emits the correct glob — default src/content/<name>', async () => {
    const artifacts = await emitFrontmatterSchemas({
      config: { collections: { docs: { type: 'pages', schema: {} } } },
      root: tmpDir,
    })
    expect(artifacts[0]!.glob).toBe('src/content/docs/**/*.md')
  })

  it('honours an explicit collection path', async () => {
    const artifacts = await emitFrontmatterSchemas({
      config: {
        collections: {
          docs: { type: 'pages', schema: {}, path: 'content/d' },
        },
      },
      root: tmpDir,
    })
    expect(artifacts[0]!.glob).toBe('content/d/**/*.md')
  })

  it('writeVscodeSnippetFile emits the snippet alongside .pyreon/', async () => {
    const artifacts = await emitFrontmatterSchemas({
      config: { collections: { docs: { type: 'pages', schema: {} } } },
      root: tmpDir,
    })
    const file = await writeVscodeSnippetFile(
      { config: { collections: { docs: { type: 'pages', schema: {} } } }, root: tmpDir },
      artifacts,
    )
    expect(file).toContain('.pyreon/vscode-settings.json')
    const content = await fs.readFile(file, 'utf8')
    expect(content).toContain('yaml.schemas')
  })
})
