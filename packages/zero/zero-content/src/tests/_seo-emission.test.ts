/**
 * Emitting sitemap.xml, rss.xml and llms.txt from the built content.
 *
 * Every one of these is read by a machine that never reports a problem
 * back. A sitemap listing a URL that 404s costs crawl budget and quietly
 * demotes the site; an RSS feed with a wrong link sends every subscriber
 * to a dead page; a missing `collectionUrls` override publishes URLs
 * under a prefix the router does not serve. The build stays green
 * throughout.
 *
 * The `collectionUrls` map is the sharp part. It has THREE meanings and
 * they are easy to collapse: absent means "use `/<collection>`", a string
 * means "use this prefix instead", and an explicit `null` means "this
 * collection is not public — exclude it entirely". Treating `null` as
 * absent publishes a private collection's URLs into the sitemap and the
 * feed, which is a disclosure rather than a formatting mistake.
 *
 * `baseUrl` is the other: without it every URL would be relative, and a
 * relative URL in a sitemap or a feed is invalid. The function refuses
 * and warns rather than emitting a file that looks fine and is not.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emitSeoOutputs } from '../plugin'

const TMP = path.join(process.cwd(), 'src', 'tests', '__seo_tmp__')
let out: string

const page = (slug: string, over: Record<string, unknown> = {}) =>
  ({ slug, title: `T ${slug}`, headings: [], body: '', url: `/docs/${slug}`, ...over }) as never

beforeEach(async () => {
  out = path.join(TMP, `o-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(out, { recursive: true })
})
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

const emit = async (seo: unknown, entries: Record<string, unknown[]> = { docs: [page('a')] }) => {
  const warnings: string[] = []
  await emitSeoOutputs(seo as never, entries as never, out, (m) => warnings.push(m))
  const read = async (f: string) => {
    try { return await fs.readFile(path.join(out, f), 'utf8') } catch { return null }
  }
  return {
    warnings,
    sitemap: await read('sitemap.xml'),
    rss: await read('rss.xml'),
    llms: await read('llms.txt'),
  }
}

describe('nothing is emitted without a baseUrl', () => {
  it('refuses with a warning naming the missing option', async () => {
    // A relative URL in a sitemap or a feed is invalid; emitting one
    // produces a file that parses and is ignored.
    const r = await emit({ sitemap: true, rss: { collection: 'docs', title: 'F' }, llms: true })
    expect(r.sitemap).toBeNull()
    expect(r.rss).toBeNull()
    expect(r.llms).toBeNull()
    expect(r.warnings.join(' ')).toContain('baseUrl')
  })
})

describe('the sitemap lists absolute URLs for every public page', () => {
  it('emits one entry per page', async () => {
    // The control.
    const r = await emit(
      { baseUrl: 'https://site.com', sitemap: true },
      { docs: [page('a'), page('b')] },
    )
    expect(r.sitemap).toContain('https://site.com/docs/a')
    expect(r.sitemap).toContain('https://site.com/docs/b')
  })

  it('carries changefreq and priority when configured', async () => {
    const r = await emit({
      baseUrl: 'https://site.com',
      sitemap: { changefreq: 'weekly', priority: 0.8 },
    })
    expect(r.sitemap).toContain('weekly')
    expect(r.sitemap).toContain('0.8')
  })

  it('omits them when not configured', async () => {
    // An invented default priority tells a crawler something the author
    // never said.
    const r = await emit({ baseUrl: 'https://site.com', sitemap: true })
    expect(r.sitemap).not.toContain('changefreq')
    expect(r.sitemap).not.toContain('priority')
  })

  it('accepts priority 0 — a falsy but meaningful value', async () => {
    // `if (opts.priority)` would drop it. Zero means "least important",
    // which is a deliberate signal.
    const r = await emit({ baseUrl: 'https://site.com', sitemap: { priority: 0 } })
    expect(r.sitemap).toContain('priority')
  })

  it('emits nothing when the sitemap is not enabled', async () => {
    expect((await emit({ baseUrl: 'https://site.com' })).sitemap).toBeNull()
  })
})

describe('collectionUrls has three meanings and they must stay distinct', () => {
  const entries = { docs: [page('a')], internal: [page('x')] }

  it('defaults to /<collection>', async () => {
    const r = await emit({ baseUrl: 'https://s.com', sitemap: true }, entries)
    expect(r.sitemap).toContain('/docs/a')
    expect(r.sitemap).toContain('/internal/x')
  })

  it('honours a string OVERRIDE', async () => {
    // The router serves `/guide`, not `/docs`. Publishing the default
    // fills the sitemap with 404s.
    const r = await emit(
      { baseUrl: 'https://s.com', sitemap: true, collectionUrls: { docs: '/guide' } },
      entries,
    )
    expect(r.sitemap).toContain('/guide/a')
    expect(r.sitemap).not.toContain('/docs/a')
  })

  it('EXCLUDES a collection mapped to null', async () => {
    // The disclosure case. `null` means "not public"; treating it as
    // absent publishes an internal collection's URLs.
    const r = await emit(
      { baseUrl: 'https://s.com', sitemap: true, collectionUrls: { internal: null } },
      entries,
    )
    expect(r.sitemap).toContain('/docs/a')
    expect(r.sitemap, 'a null-mapped collection must not be published').not.toContain('/internal/')
  })

  it('applies the exclusion to the FEED and llms.txt too', async () => {
    // A collection excluded from the sitemap but present in the feed is
    // the same disclosure through another file.
    const r = await emit(
      {
        baseUrl: 'https://s.com',
        rss: { collection: 'internal', title: 'F' },
        llms: true,
        collectionUrls: { internal: null },
      },
      entries,
    )
    expect(r.rss).not.toContain('/internal/')
    expect(r.llms).not.toContain('/internal/')
  })
})

describe('the RSS feed is scoped to one collection', () => {
  it('emits items for the named collection only', async () => {
    const r = await emit(
      { baseUrl: 'https://s.com', rss: { collection: 'blog', title: 'Blog' } },
      { blog: [page('post')], docs: [page('a')] },
    )
    expect(r.rss).toContain('/blog/post')
    expect(r.rss).not.toContain('/docs/a')
  })

  it('WARNS rather than guessing when rss is bare true', async () => {
    // A feed needs a collection and a title. Picking one silently
    // publishes whichever collection happened to sort first.
    const r = await emit({ baseUrl: 'https://s.com', rss: true })
    expect(r.rss).toBeNull()
    expect(r.warnings.join(' ')).toContain('collection')
  })

  it('emits an empty feed for a collection with no entries', async () => {
    // A feed the author configured for a collection they have not
    // written yet. An empty channel is valid; a crash is not.
    const r = await emit(
      { baseUrl: 'https://s.com', rss: { collection: 'nope', title: 'F' } },
      { docs: [page('a')] },
    )
    expect(r.rss).toContain('<channel>')
  })

  it('carries the optional description and language when given', async () => {
    const r = await emit({
      baseUrl: 'https://s.com',
      rss: { collection: 'docs', title: 'F', description: 'D', language: 'en-GB' },
    })
    expect(r.rss).toContain('<description>D</description>')
    expect(r.rss).toContain('en-GB')
  })

  it('carries a per-item description only when the page has one', async () => {
    const r = await emit(
      { baseUrl: 'https://s.com', rss: { collection: 'docs', title: 'F' } },
      { docs: [page('a', { description: 'about a' }), page('b')] },
    )
    expect(r.rss).toContain('about a')
  })
})

describe('llms.txt groups pages by collection', () => {
  it('emits a section per non-empty collection, title-cased', async () => {
    const r = await emit(
      { baseUrl: 'https://s.com', llms: true },
      { docs: [page('a')], blog: [page('p')] },
    )
    expect(r.llms).toContain('Docs')
    expect(r.llms).toContain('Blog')
    expect(r.llms).toContain('/docs/a')
  })

  it('omits a collection with no pages rather than emitting a bare heading', async () => {
    const r = await emit(
      { baseUrl: 'https://s.com', llms: true },
      { docs: [page('a')], empty: [] },
    )
    expect(r.llms).toContain('Docs')
    expect(r.llms).not.toContain('Empty')
  })

  it('includes a page description when it has one', async () => {
    const r = await emit(
      { baseUrl: 'https://s.com', llms: true },
      { docs: [page('a', { description: 'the summary' })] },
    )
    expect(r.llms).toContain('the summary')
  })
})
