/**
 * The build-mode path: `transform` accumulating search entries, and
 * `closeBundle` writing them out.
 *
 * Every failure here ships a site whose search is wrong rather than
 * broken, which is worse — the palette opens, results appear, and the
 * ones that should be there are not. There is no error anywhere.
 *
 * Three contracts, all of which the package's own comments describe and
 * none of which was asserted:
 *
 *   * **the inner SSG server build must not re-emit the index.** It also
 *     runs with `command: 'build'`, so it slips past the obvious gate,
 *     and its `outDir` is an ABSOLUTE path pointing at
 *     `dist/.zero-ssg-server/`. Letting it run overwrites the outer
 *     build's index with one derived from a different pass.
 *   * **dev-mode transforms must not leak into a build.** The plugin
 *     instance is reused, so entries accumulated while the dev server
 *     was running would ship in the production index — including pages
 *     since deleted.
 *   * **output must be deterministic.** The index is diffed across
 *     builds; insertion order would make every build produce a
 *     different artifact.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import content from '../plugin'

const TMP = path.join(process.cwd(), 'src', 'tests', '__buildidx_tmp__')
let root: string
let savedInner: string | undefined

const CONFIG = {
  collections: {
    docs: { type: 'pages', path: 'src/content/docs', schema: {} },
  },
}

const page = (title: string, body = 'some body text') =>
  `---\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`

beforeEach(async () => {
  savedInner = process.env.PYREON_ZERO_SSG_INNER_BUILD
  delete process.env.PYREON_ZERO_SSG_INNER_BUILD
  root = path.join(TMP, `b-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(root, 'src', 'content', 'docs'), { recursive: true })
  await fs.writeFile(path.join(root, 'content.config.ts'), 'export default {}')
})
afterEach(async () => {
  if (savedInner === undefined) delete process.env.PYREON_ZERO_SSG_INNER_BUILD
  else process.env.PYREON_ZERO_SSG_INNER_BUILD = savedInner
  await fs.rm(TMP, { recursive: true, force: true })
})

/**
 * Drive the REAL plugin's build hooks.
 *
 * `content.config.ts` is loaded through `ssrLoadModule`, which only
 * `configureServer` supplies — so a build-mode run needs the config
 * threaded in the same way a dev server would. Without it `loadedConfig`
 * is null, `closeBundle` returns immediately, and every assertion below
 * passes against a plugin that did nothing.
 */
async function harness(opts: Record<string, unknown> = {}, config: unknown = CONFIG) {
  const plugin = content(opts as never)
  const warnings: string[] = []
  const errors: string[] = []
  const outDir = 'dist'

  await (plugin.configResolved as (c: unknown) => Promise<void>)({
    root, command: 'build', base: '/', build: { outDir },
  } as never)
  await (plugin.configureServer as (s: unknown) => Promise<void>)({
    middlewares: { use: () => {} },
    ssrLoadModule: async (f: string) =>
      /content\.config\./.test(f) ? { default: config } : {},
    config: { logger: { warn: (m: string) => warnings.push(m) } },
  } as never)

  const ctx = {
    warn: (m: unknown) => warnings.push(String(m)),
    error: (m: unknown) => { errors.push(String(m)); throw new Error(String(m)) },
  }
  return {
    warnings,
    errors,
    buildStart: () => (plugin.buildStart as never as (this: unknown) => Promise<void>).call(ctx),
    transform: async (relPath: string, body: string) => {
      const abs = path.join(root, relPath)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, body)
      return (plugin.transform as never as (
        this: unknown, code: string, id: string,
      ) => Promise<unknown>).call(ctx, body, abs)
    },
    closeBundle: () =>
      (plugin.closeBundle as never as (this: unknown) => Promise<void>).call(ctx),
    read: async (f: string) => {
      try { return await fs.readFile(path.join(root, outDir, f), 'utf8') } catch { return null }
    },
  }
}

describe('a build accumulates entries and writes the index', () => {
  it('writes a catalog and a chunk for the transformed pages', async () => {
    // The control. Every "must not write" spec below is worthless
    // against a pipeline that writes nothing.
    const h = await harness()
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.transform('src/content/docs/b.md', page('Beta'))
    await h.closeBundle()

    const catalog = JSON.parse((await h.read('search-index.json'))!) as {
      collections: { name: string }[]
    }
    expect(catalog.collections.map((c) => c.name)).toEqual(['docs'])
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('Alpha')
    expect(chunk).toContain('Beta')
  })

  it('orders entries by slug, so two builds produce the same bytes', async () => {
    // The artifact is diffed across builds; insertion order would make
    // every build differ.
    const h = await harness()
    for (const n of ['zeta', 'alpha', 'mid']) {
      await h.transform(`src/content/docs/${n}.md`, page(n))
    }
    await h.closeBundle()
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk.indexOf('alpha')).toBeLessThan(chunk.indexOf('mid'))
    expect(chunk.indexOf('mid')).toBeLessThan(chunk.indexOf('zeta'))
  })

  it('indexes a markdown file only — not a .ts sibling', async () => {
    // `transform` runs for every module in the graph. Compiling a `.ts`
    // file as markdown would corrupt it.
    const h = await harness()
    expect(await h.transform('src/content/docs/helper.ts', 'export const x = 1')).toBeNull()
  })

  it('ignores a markdown file OUTSIDE every collection', async () => {
    // A README next to the source. Indexing it puts a page in the
    // palette that the router cannot navigate to.
    const h = await harness()
    await h.transform('src/components/README.md', page('Readme'))
    await h.closeBundle()
    expect(await h.read('search-index.json')).toBeNull()
  })

  it('carries the frontmatter title and description into the index', async () => {
    const h = await harness()
    await h.transform(
      'src/content/docs/a.md',
      '---\ntitle: Real Title\ndescription: Real Description\n---\n\nbody\n',
    )
    await h.closeBundle()
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('Real Title')
    expect(chunk).toContain('Real Description')
  })

  it('falls back to the SLUG when there is no title', async () => {
    // A page with no frontmatter is ordinary. `title: undefined` in the
    // palette renders a blank row.
    const h = await harness()
    await h.transform('src/content/docs/no-title.md', '# Just A Heading\n')
    await h.closeBundle()
    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('no-title')
    expect(chunk).not.toContain('undefined')
  })
})

describe('the index is written by exactly ONE build', () => {
  it('the INNER SSG server build must not re-emit it', async () => {
    // That build also runs with `command: 'build'`, so it slips past the
    // obvious gate — and its outDir points into `dist/.zero-ssg-server/`.
    // Letting it run overwrites the outer build's index.
    const h = await harness()
    await h.transform('src/content/docs/a.md', page('Alpha'))
    process.env.PYREON_ZERO_SSG_INNER_BUILD = '1'
    await h.closeBundle()
    expect(await h.read('search-index.json'), 'the inner build owns nothing').toBeNull()
  })

  it('writes nothing when no page was transformed', async () => {
    // A build of a site with no content. An empty catalog file would be
    // fetched and parsed for nothing.
    const h = await harness()
    await h.closeBundle()
    expect(await h.read('search-index.json')).toBeNull()
  })
})

describe('buildStart clears state the previous pass left behind', () => {
  it('drops entries accumulated before it', async () => {
    // The plugin instance is reused across consecutive builds — dev then
    // build, or the SSG outer/inner pair. Without the clear, a page
    // deleted since the dev server started still ships in the index.
    const h = await harness()
    await h.transform('src/content/docs/stale.md', page('Stale'))
    await h.buildStart()
    await h.transform('src/content/docs/fresh.md', page('Fresh'))
    await h.closeBundle()

    const chunk = (await h.read('search-index-docs.json'))!
    expect(chunk).toContain('Fresh')
    expect(chunk, 'a page from the previous pass must not ship').not.toContain('Stale')
  })
})

describe('the deploy base reaches the catalog URLs', () => {
  it('prefixes catalog URLs with Vite base', async () => {
    // Without it the runtime fetches `/search-index-docs.json`, escapes
    // the subpath, and 404s on every subpath deploy — while dev works.
    const plugin = content()
    await (plugin.configResolved as (c: unknown) => Promise<void>)({
      root, command: 'build', base: '/pyreon/', build: { outDir: 'dist' },
    } as never)
    await (plugin.configureServer as (s: unknown) => Promise<void>)({
      middlewares: { use: () => {} },
      ssrLoadModule: async (f: string) =>
        /content\.config\./.test(f) ? { default: CONFIG } : {},
      config: { logger: { warn: () => {} } },
    } as never)
    const ctx = { warn: () => {}, error: (m: unknown) => { throw new Error(String(m)) } }
    const abs = path.join(root, 'src/content/docs/a.md')
    await fs.writeFile(abs, page('Alpha'))
    await (plugin.transform as never as (this: unknown, c: string, i: string) => Promise<unknown>)
      .call(ctx, page('Alpha'), abs)
    await (plugin.closeBundle as never as (this: unknown) => Promise<void>).call(ctx)

    const catalog = JSON.parse(
      await fs.readFile(path.join(root, 'dist', 'search-index.json'), 'utf8'),
    ) as { collections: { url: string }[] }
    expect(catalog.collections[0]!.url).toBe('/pyreon/search-index-docs.json')
  })
})

describe('SEO artifacts are emitted from the same accumulated entries', () => {
  it('writes sitemap, feed and llms.txt when configured', async () => {
    const h = await harness({
      seo: {
        baseUrl: 'https://site.com',
        sitemap: true,
        rss: { collection: 'docs', title: 'Docs' },
        llms: true,
      },
    })
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.closeBundle()
    expect(await h.read('sitemap.xml')).toContain('https://site.com/docs/a')
    expect(await h.read('rss.xml')).toContain('Alpha')
    expect(await h.read('llms.txt')).toContain('/docs/a')
  })

  it('writes none of them when seo is not configured', async () => {
    const h = await harness()
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.closeBundle()
    expect(await h.read('sitemap.xml')).toBeNull()
    expect(await h.read('rss.xml')).toBeNull()
  })

  it('skips SEO when baseUrl is missing, and still writes the index', async () => {
    // A partial `seo` block must not cost the search index.
    const h = await harness({ seo: { sitemap: true } })
    await h.transform('src/content/docs/a.md', page('Alpha'))
    await h.closeBundle()
    expect(await h.read('sitemap.xml')).toBeNull()
    expect(await h.read('search-index.json')).toBeTruthy()
  })
})
