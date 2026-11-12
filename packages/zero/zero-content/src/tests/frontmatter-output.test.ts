/**
 * Every content module ships the collection schema's PARSED frontmatter —
 * defaults applied, values typed as the schema outputs them (a `Date` stays
 * a `Date`) — so `entry.data` at runtime is what the generated
 * `CollectionSchemas` types promise. Before, the raw YAML shipped: defaults
 * were missing and every date was an ISO string.
 *
 * Also: the collection metadata module (`virtual:zero-content/meta/<name>`)
 * that listings read instead of every entry's page chunk.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../plugin'
import { toJsExpression } from '../pipeline/serialize'
import { excerptOf } from '../pipeline/word-count'
import { compileMarkdown } from '../pipeline/parse'
import { renderMetaModule } from '../virtual-collections'

describe('toJsExpression', () => {
  it('writes JSON values as JSON and dates as Date constructors', () => {
    const value = { a: 'x', n: 1.5, b: true, z: null, list: [1, 'two'], d: new Date(0), nested: { skip: undefined, k: 2 } }
    const code = toJsExpression(value)
    expect(code).toBe('{"a": "x", "n": 1.5, "b": true, "z": null, "list": [1, "two"], "d": new Date(0), "nested": {"k": 2}}')
    expect(new Function(`return ${code}`)()).toEqual({ ...value, nested: { k: 2 } })
    expect(toJsExpression(Number.POSITIVE_INFINITY)).toBe('Infinity')
    expect(toJsExpression(new Date('nope'))).toBe('new Date(NaN)')
  })

  it('refuses values that cannot round-trip through a module', () => {
    expect(() => toJsExpression({ m: new Map() })).toThrow(/frontmatter\.m: .*plain data/)
    expect(() => toJsExpression({ f: () => 1 })).toThrow(/frontmatter\.f/)
  })
})

describe('excerptOf', () => {
  it('is the first paragraph as plain text, cut at a word boundary', async () => {
    const r = await compileMarkdown(
      '---\ntitle: T\n---\n\n# Heading\n\nFirst **bold** paragraph with `code` and [a link](/x).\n\nSecond.\n',
      '/p/src/content/blog/x.md',
      { highlight: false },
    )
    expect(r.excerpt).toBe('First bold paragraph with code and a link.')
    expect(r.code).toContain('export const excerpt = "First bold paragraph with code and a link."')
    const long = await compileMarkdown(`${'word '.repeat(100)}\n`, '/p/x.md', { highlight: false })
    expect(long.excerpt.length).toBeLessThanOrEqual(201)
    expect(long.excerpt.endsWith('word…')).toBe(true)
    expect(excerptOf({ type: 'root', children: [] })).toBe('')
  })

  it('drops trailing punctuation and whitespace before the ellipsis', () => {
    const para = (value: string) =>
      ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] }) as Parameters<
        typeof excerptOf
      >[0]
    expect(excerptOf(para(`alpha beta, — ${'x'.repeat(40)}`), 20)).toBe('alpha beta…')
    expect(excerptOf(para(`${'a'.repeat(15)}.,;:–-${'b'.repeat(10)}`), 20)).toBe(`${'a'.repeat(15)}…`)
  })
})

describe('the shipped frontmatter is the schema output', () => {
  const ROOT = path.join(process.cwd(), 'src', 'tests', '__tmp__')
  let dir: string
  beforeEach(async () => {
    await fs.mkdir(ROOT, { recursive: true })
    dir = await fs.mkdtemp(path.join(ROOT, 'fm-output-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  // A schema that applies a default and turns the date into a Date — the
  // two things the raw YAML never had.
  const schema = `{
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (input) => typeof input.title === 'string'
        ? { value: { ...input, tags: input.tags ?? ['default-tag'], date: new Date(String(input.date)) } }
        : { issues: [{ message: 'title is required', path: ['title'] }] },
    },
  }`

  async function setup() {
    await fs.writeFile(
      path.join(dir, 'content.config.js'),
      `export default { collections: { notes: { type: 'pages', schema: ${schema} } } }`,
    )
    const notes = path.join(dir, 'src', 'content', 'notes')
    await fs.mkdir(notes, { recursive: true })
    const file = path.join(notes, 'hello.md')
    const source = `---\ntitle: Hello\ndate: "2026-11-16"\n---\n\nBODY_HELLO lives only in the page chunk.\n`
    await fs.writeFile(file, source)
    const plugin = content({ highlight: false, mdxDir: dir, compileJsx: false })
    await (plugin.configResolved as (this: unknown, c: unknown) => Promise<void>).call({}, {
      root: dir,
      command: 'serve',
      logger: { warn: vi.fn() },
    })
    return { plugin, file, source }
  }

  it('a page module exports the parsed frontmatter (defaults, Date)', async () => {
    const { plugin, file, source } = await setup()
    const error = vi.fn()
    const out = (await (plugin.transform as (this: unknown, c: string, id: string) => Promise<{ code: string }>).call(
      { error, warn: vi.fn() },
      source,
      file,
    ))
    expect(error).not.toHaveBeenCalled()
    expect(out.code).toContain('"tags": ["default-tag"]')
    expect(out.code).toMatch(/"date": new Date\(1794787200000\)/)
  })

  it('an invalid entry fails with the formatted schema issues', async () => {
    const { plugin, file } = await setup()
    const error = vi.fn()
    await (plugin.transform as (this: unknown, c: string, id: string) => Promise<unknown>).call(
      { error, warn: vi.fn() },
      '---\ndate: 2026-01-01\n---\n\nx\n',
      file,
    )
    expect(error).toHaveBeenCalledOnce()
    expect(error.mock.calls[0]![0]).toContain('does not match collection "notes" schema')
  })

  it('the metadata module carries slug, parsed frontmatter, word count and excerpt — never the body markup', async () => {
    const { plugin } = await setup()
    const ctx = { error: (m: string) => { throw new Error(m) }, warn: vi.fn() }
    const resolved = (plugin.resolveId as (this: unknown, s: string) => string | null).call(ctx, 'virtual:zero-content/meta/notes')
    expect(resolved).toBe('\0virtual:zero-content/meta/notes')
    const code = (await (plugin.load as (this: unknown, id: string) => Promise<string>).call(ctx, resolved!))
    expect(code).toContain('slug: "hello"')
    expect(code).toContain('"tags": ["default-tag"]')
    expect(code).toContain('new Date(1794787200000)')
    expect(code).toContain('wordCount: 8')
    // The excerpt is plain text; the compiled page (JSX, components) is not here.
    expect(code).not.toContain('ContentPage')
    expect(code).not.toContain('export default')
    const mod = new Function(`${code.replace('export const entries =', 'return')}`)() as Array<{ frontmatter: { date: Date } }>
    expect(mod[0]!.frontmatter.date).toBeInstanceOf(Date)
  })

  it('renders an empty module for an unknown collection', async () => {
    const { plugin } = await setup()
    const ctx = { error: vi.fn(), warn: vi.fn() }
    expect(await (plugin.load as (this: unknown, id: string) => Promise<string>).call(ctx, '\0virtual:zero-content/meta/nope')).toBe(
      renderMetaModule([]),
    )
  })
})
