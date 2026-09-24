/**
 * The compile cache's hit path, and the content-directory probe.
 *
 * **The cache-hit path is where the search index can silently lose
 * pages.** Vite calls `transform` for the same file more than once — the
 * SSG pass runs an inner SSR sub-build over the same source, and a dev
 * session repeatedly transforms an unchanged file. On a hit the plugin
 * skips remark, Shiki and esbuild entirely and re-runs ONLY the
 * search-index stash, which means the index population logic exists
 * twice: once on the compile path and once here. If the second copy
 * drifts, an SSG build's index is missing exactly the pages the inner
 * build happened to reach first — and nothing reports it, because the
 * page itself renders from the cached code perfectly well.
 *
 * The guard `!collMap.has(slug)` is what stops the two copies from
 * double-writing, and `buildStart` clearing the map is what makes the
 * cached path re-populate on a fresh build. Both directions matter: too
 * eager and a page is indexed twice, too shy and a rebuild after a cache
 * warm-up ships an empty index.
 *
 * **`hasMarkdownInContentDir`** decides whether the plugin bothers
 * emitting types at all. A false negative means an author with content
 * nested two directories deep silently gets no editor support.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import content, { _resetCompileCacheForTesting, hasMarkdownInContentDir } from '../plugin'

const TMP = path.join(process.cwd(), 'src', 'tests', '__cache_tmp__')
let root: string

const CONFIG = {
  collections: { docs: { type: 'pages', path: 'src/content/docs', schema: {} } },
}
const page = (title: string) => `---\ntitle: ${title}\n---\n\n# ${title}\n\nbody\n`

beforeEach(async () => {
  _resetCompileCacheForTesting()
  root = path.join(TMP, `c-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(root, 'src', 'content', 'docs'), { recursive: true })
  await fs.writeFile(path.join(root, 'content.config.ts'), 'export default {}')
})
afterEach(async () => {
  _resetCompileCacheForTesting()
  await fs.rm(TMP, { recursive: true, force: true })
})

async function buildHarness() {
  const plugin = content()
  const ctx = { warn: () => {}, error: (m: unknown) => { throw new Error(String(m)) } }
  await (plugin.configResolved as (c: unknown) => Promise<void>)({
    root, command: 'build', base: '/', build: { outDir: 'dist' },
  } as never)
  await (plugin.configureServer as (s: unknown) => Promise<void>)({
    middlewares: { use: () => {} },
    ssrLoadModule: async (f: string) =>
      /content\.config\./.test(f) ? { default: CONFIG } : {},
    config: { logger: { warn: () => {} } },
  } as never)
  return {
    transform: async (rel: string, body: string) => {
      const abs = path.join(root, rel)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, body)
      return (plugin.transform as never as (
        this: unknown, c: string, i: string,
      ) => Promise<{ code: string } | null>).call(ctx, body, abs)
    },
    buildStart: () => (plugin.buildStart as never as (this: unknown) => Promise<void>).call(ctx),
    closeBundle: () => (plugin.closeBundle as never as (this: unknown) => Promise<void>).call(ctx),
    read: async (f: string) => {
      try { return await fs.readFile(path.join(root, 'dist', f), 'utf8') } catch { return null }
    },
  }
}

describe('a repeated transform hits the cache and still indexes the page', () => {
  it('returns identical code without recompiling', async () => {
    // The control: the second call must actually take the cached branch,
    // or every assertion below is about the compile path.
    const h = await buildHarness()
    const first = await h.transform('src/content/docs/a.md', page('Alpha'))
    const second = await h.transform('src/content/docs/a.md', page('Alpha'))
    expect(second?.code).toBe(first?.code)
  })

  it('indexes the page exactly ONCE across repeated transforms', async () => {
    // The `has(slug)` guard. Without it the page is stashed on both the
    // compile and the cache-hit path and appears twice in the palette.
    const h = await buildHarness()
    for (let i = 0; i < 4; i++) await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.closeBundle()
    // Count DOCUMENTS, not occurrences of the title — the title also
    // appears in the indexed heading list and the body.
    const chunk = JSON.parse((await h.read('search-index-docs.json'))!) as {
      docs: { slug: string }[]
    }
    expect(chunk.docs.map((d) => d.slug), 'one entry, not four').toEqual(['a'])
  })

  it('RE-POPULATES from the cache after buildStart cleared the map', async () => {
    // The SSG shape: an inner build warms the compile cache, then the
    // outer build starts fresh. If the cached path did not re-stash, the
    // outer build's index would ship EMPTY while every page rendered
    // perfectly from cached code.
    const h = await buildHarness()
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.buildStart()
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.closeBundle()
    const chunk = await h.read('search-index-docs.json')
    expect(chunk, 'the index must survive a cache-warm rebuild').toBeTruthy()
    expect(chunk).toContain('Alpha')
  })

  it('carries the frontmatter through the CACHED path too', async () => {
    // The cache-hit path rebuilds the entry from the cached frontmatter
    // rather than re-parsing. A drift here indexes the slug instead of
    // the title.
    const h = await buildHarness()
    const body = '---\ntitle: Real Title\ndescription: Real Desc\n---\n\nbody\n'
    await h.transform('src/content/docs/a.md', body)
    await h.buildStart()
    await h.transform('src/content/docs/a.md', body)
    await h.closeBundle()
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('Real Title')
    expect(chunk).toContain('Real Desc')
  })

  it('falls back to the slug on the cached path when there is no title', async () => {
    const h = await buildHarness()
    await h.transform('src/content/docs/untitled.md', '# Just a heading\n')
    await h.buildStart()
    await h.transform('src/content/docs/untitled.md', '# Just a heading\n')
    await h.closeBundle()
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('untitled')
    expect(chunk).not.toContain('undefined')
  })

  it('recompiles when the CONTENT changed', async () => {
    // The key includes a content hash. Serving the cached code for
    // edited source would make every dev save a no-op.
    const h = await buildHarness()
    const first = await h.transform('src/content/docs/a.md', page('Alpha'))
    const edited = await h.transform('src/content/docs/a.md', page('Beta'))
    expect(edited?.code).not.toBe(first?.code)
    expect(edited?.code).toContain('Beta')
  })

  it('keeps separate entries for two different files', async () => {
    const h = await buildHarness()
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.transform('src/content/docs/b.md', page('Beta'))
    await h.closeBundle()
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('Alpha')
    expect(chunk).toContain('Beta')
  })

  it('does not index a cached file outside a collection', async () => {
    // The `collectionName !== null` guard on the cached path, mirroring
    // the compile path's.
    const h = await buildHarness()
    await h.transform('src/components/README.md', page('Readme'))
    await h.transform('src/components/README.md', page('Readme'))
    await h.closeBundle()
    expect(await h.read('search-index.json')).toBeNull()
  })
})

describe('hasMarkdownInContentDir finds content at any reasonable depth', () => {
  it('finds a file at the top of src/content', async () => {
    await fs.writeFile(path.join(root, 'src', 'content', 'a.md'), '# a')
    expect(await hasMarkdownInContentDir(root)).toBe(true)
  })

  it('finds one NESTED two directories deep', async () => {
    // The ordinary layout — `src/content/docs/guides/intro.md`. A false
    // negative here silently costs the author every editor hint.
    const deep = path.join(root, 'src', 'content', 'docs', 'guides')
    await fs.mkdir(deep, { recursive: true })
    await fs.writeFile(path.join(deep, 'intro.md'), '# intro')
    expect(await hasMarkdownInContentDir(root)).toBe(true)
  })

  it('accepts .mdx and an uppercase extension', async () => {
    await fs.writeFile(path.join(root, 'src', 'content', 'a.MDX'), '# a')
    expect(await hasMarkdownInContentDir(root)).toBe(true)
  })

  it('is false for a tree with no markdown', async () => {
    await fs.writeFile(path.join(root, 'src', 'content', 'notes.txt'), 'x')
    expect(await hasMarkdownInContentDir(root)).toBe(false)
  })

  it('is false when src/content does not exist', async () => {
    // The commonest case — a project not using content at all. `readdir`
    // throws ENOENT and must be swallowed, not propagated into config
    // resolution.
    const bare = path.join(TMP, 'bare')
    await fs.mkdir(bare, { recursive: true })
    await expect(hasMarkdownInContentDir(bare)).resolves.toBe(false)
  })

  it('stops past the depth cap rather than walking forever', async () => {
    // A deep tree — or a symlink cycle. The cap is what bounds it.
    let dir = path.join(root, 'src', 'content')
    for (let i = 0; i < 8; i++) dir = path.join(dir, `d${i}`)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'deep.md'), '# deep')
    expect(await hasMarkdownInContentDir(root), 'beyond the cap').toBe(false)
  })
})
