/* oxlint-disable complexity, max-lines-per-function -- emitSeoOutputs moved verbatim from plugin.ts */
// ─── plugin-helpers.ts ─────────────────────────────────────────────────────
//
// Internal: the build steps of the content Vite plugin: search entries,
// collection matching, publish filtering, SEO output emission, link rewriting
// and error-path formatting. Split out of the public entry `plugin.ts`, which
// imports from here, so these helpers are not public API; their unit tests
// reach them through `@pyreon/zero-content/internal-server`.

import path from 'node:path'
import { stripMarkdown, type CollectionEntryForIndex } from './search/index-builder'
import { promises as fsp } from 'node:fs'
import { generateLlmsTxt } from './seo/llms-txt'
import { generateRssFeed, type RssItem } from '@pyreon/zero'
import { parseFrontmatter } from './pipeline/frontmatter'
import { isPublished, readPublishTime } from './publish'
import { markdownToFeedHtml } from './seo/feed-html'
import { generateSitemap, joinUrl, type SitemapPage } from './seo/sitemap'
import type { ContentConfig, Heading } from './types'
import { resolvedRootForPaths } from './plugin-state'
import type { SeoEmitOptions } from './plugin'

/**
 * Build the search entry for one page — the page is the single searchable
 * unit, with its heading anchors stored alongside it. The runtime
 * (`search-runtime`) picks the heading whose text best matches the query and
 * deep-links the result to that `#anchor`, so a hit jumps to the exact
 * section. This delivers section-precision navigation WITHOUT one document
 * per section — which ~4×'s the index and hits the 1 MB build-error cliff
 * around ~130 pages; the anchor selection is a cheap query-time scan instead.
 *
 * @internal exported for testing
 */
export function buildPageSearchEntry(args: {
  collectionName: string
  pageSlug: string
  title: string
  description: string | undefined
  /** Raw markdown source (NOT the compiled JSX). */
  source: string
  headings: readonly Heading[]
  bodyMax: number
}): CollectionEntryForIndex {
  const capBody = (s: string, max: number): string => {
    if (s.length <= max) return s
    const slice = s.slice(0, max)
    const lastSpace = slice.lastIndexOf(' ')

    return lastSpace > max * 0.8 ? slice.slice(0, lastSpace) : slice
  }
  const entry: CollectionEntryForIndex = {
    slug: args.pageSlug,
    title: args.title,
    headings: args.headings.map((h) => h.text),
    body: capBody(stripMarkdown(args.source), args.bodyMax),
    url: `/${args.collectionName}/${args.pageSlug}`,
  }
  // Anchors for query-time deep-linking. Lowercase the heading text so the
  // runtime can `.includes()` the (already-lowercased) matched query terms.
  const anchors = args.headings
    .filter((h) => h.slug.length > 0)
    .map((h) => ({ t: h.text.toLowerCase(), s: h.slug }))
  if (anchors.length > 0) entry.anchors = anchors
  if (args.description !== undefined) entry.description = args.description

  return entry
}

/**
 * PR-J audit H10 — given an absolute file id, a collections map, and
 * the Vite root, return the name of the LONGEST-prefix-matching
 * collection or `null` when no collection's path is an ancestor of
 * the id. Pure — exported so tests can drive it without booting a
 * real Vite plugin instance.
 *
 * Why longest-prefix: nested collection paths (`src/content/docs` AND
 * `src/content/docs/api`) would otherwise route every `docs/api/*`
 * file to whichever collection was declared first in the config
 * object. The first-match shape ignored the declared object order
 * stability anyway (depending on JS object iteration order). Longest-
 * prefix is the deterministic, intuitive rule.
 *
 * @internal exported for testing
 */
export function findCollectionForFileImpl(
  id: string,
  collections: Record<string, { path?: string }>,
  root: string,
): string | null {
  let best: { name: string; abs: string } | null = null
  for (const [name, def] of Object.entries(collections)) {
    const collectionPath = def.path ?? `src/content/${name}`
    const abs = path.isAbsolute(collectionPath)
      ? collectionPath
      : path.join(root, collectionPath)
    const rel = path.relative(abs, id)
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue
    if (best === null || abs.length > best.abs.length) {
      best = { name, abs }
    }
  }

  return best?.name ?? null
}

/**
 * The slug a page is INDEXED under: its path relative to the collection
 * root, extension dropped, separators normalised to `/`.
 *
 * Extracted because it was computed in one place and cached in another.
 * The compile path derived this, indexed under it, and then stored the
 * markdown pipeline's own `result.slug` on the cache entry — a
 * ROOT-relative value. The cache-hit path read that instead, so the
 * `has(slug)` guard compared two different strings, never matched, and
 * stashed the SAME page a second time under `docs/a` rather than `a`.
 *
 * Its URL is built as `/<collection>/<slug>`, so the duplicate resolved
 * to `/docs/docs/a` — a search hit that 404s. Every SSG build transforms
 * each page at least twice (the outer client build and the inner SSR
 * sub-build), so this shipped for every page of every content site, with
 * the correct entry sitting right beside it.
 *
 * @internal exported for testing
 */
export function collectionSlugFor(
  id: string,
  collectionPath: string,
  root: string,
): string {
  const absCollectionPath = path.isAbsolute(collectionPath)
    ? collectionPath
    : path.join(root, collectionPath)

  return path
    .relative(absCollectionPath, id)
    .replace(/\.(md|mdx)$/, '')
    .split(path.sep)
    .join('/')
}

/**
 * What the build remembers about each collection entry beyond its search
 * document: the frontmatter (publish state, feed dates and tags) and the
 * raw markdown source (feed bodies).
 *
 * @internal
 */
export interface EntryMeta {
  frontmatter: Record<string, unknown>
  source: string
}

/**
 * Drop unpublished entries (`draft: true`, or a `publishDate` after `now`)
 * from the per-collection entry lists a production build writes into the
 * search index, sitemap, RSS feed and llms.txt. An entry with no recorded
 * frontmatter is kept — it was never seen by `transform`, so there is
 * nothing to judge it by.
 *
 * @internal exported for testing
 */
export function selectPublishedEntries(
  entriesByCollection: Record<string, CollectionEntryForIndex[]>,
  meta: ReadonlyMap<string, ReadonlyMap<string, EntryMeta>>,
  config: ContentConfig,
  now: number,
): Record<string, CollectionEntryForIndex[]> {
  const out: Record<string, CollectionEntryForIndex[]> = {}
  for (const [collection, entries] of Object.entries(entriesByCollection)) {
    const publishDate = config.collections[collection]?.publishDate
    const collMeta = meta.get(collection)
    out[collection] = entries.filter((entry) => {
      const fm = collMeta?.get(entry.slug)?.frontmatter
      return fm === undefined || isPublished(fm, publishDate, now)
    })
  }

  return out
}

/**
 * The files of every `unpublished: 'omit'` collection that are not
 * published at `now`, as absolute paths — the negative glob patterns of a
 * production build's virtual collections module. Reads each file's
 * frontmatter directly: the glob decides what gets transformed, so this
 * cannot wait for `transform` to have seen the file.
 *
 * @internal exported for testing
 */
export async function collectUnpublishedFiles(
  config: ContentConfig,
  root: string,
  now: number,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  for (const [name, def] of Object.entries(config.collections)) {
    if (def.unpublished !== 'omit') continue
    const dir = path.resolve(root, def.path ?? `src/content/${name}`)
    let files: string[]
    try {
      files = (await fsp.readdir(dir, { recursive: true }))
        .filter((f) => /\.mdx?$/.test(f))
        .map((f) => path.join(dir, f))
    } catch {
      continue
    }
    const excluded: string[] = []
    for (const file of files) {
      const { data } = parseFrontmatter(await fsp.readFile(file, 'utf8'))
      if (!isPublished(data, def.publishDate, now)) excluded.push(file)
    }
    out[name] = excluded.sort()
  }

  return out
}

/**
 * The instant a production build decides publish state at. Normally the
 * build's own clock; `PYREON_CONTENT_NOW` (any `Date`-parseable value)
 * overrides it, which is how you build the site as it will look on a
 * future date — e.g. to check a scheduled post before its day.
 *
 * @internal exported for testing
 */
export function resolvePublishNow(env: Record<string, string | undefined> = process.env): number {
  const override = env['PYREON_CONTENT_NOW']
  if (override !== undefined && override !== '') {
    const t = Date.parse(override)
    if (Number.isNaN(t)) {
      throw new Error(
        `[@pyreon/zero-content] PYREON_CONTENT_NOW="${override}" is not a date. Use an ISO date such as 2026-11-16 or 2026-11-16T09:00:00Z, or unset it.`,
      )
    }

    return t
  }

  return Date.now()
}

/**
 * PR-L audit M19 — write configured SEO outputs (sitemap.xml / rss.xml /
 * llms.txt) to `outDir`. Pure-ish — the only side effect is `writeFile`.
 *
 * @internal exported for testing
 */
export async function emitSeoOutputs(
  seo: SeoEmitOptions,
  entriesByCollection: Record<string, CollectionEntryForIndex[]>,
  outDir: string,
  warn: (message: string) => void,
  /** Frontmatter + source per entry, and the content config — feed dates,
   *  tags and full-content bodies come from here. */
  feedContext?: {
    config: ContentConfig
    meta: ReadonlyMap<string, ReadonlyMap<string, EntryMeta>>
  },
): Promise<void> {
  const fs = await import('node:fs/promises')
  const baseUrl = seo.baseUrl
  if (!baseUrl) {
    warn(
      '[@pyreon/zero-content] SEO emission skipped — `seo.baseUrl` is required',
    )

    return
  }
  await fs.mkdir(outDir, { recursive: true })

  const urlFor = (collection: string, slug: string): string | null => {
    const override = seo.collectionUrls?.[collection]
    if (override === null) return null
    const prefix = override ?? `/${collection}`

    return `${prefix}/${slug}`
  }

  if (seo.sitemap) {
    const sitemapOpts = typeof seo.sitemap === 'object' ? seo.sitemap : {}
    const pages: SitemapPage[] = []
    for (const [collection, entries] of Object.entries(entriesByCollection)) {
      for (const entry of entries) {
        const url = urlFor(collection, entry.slug)
        if (url === null) continue
        const page: SitemapPage = { path: url }
        if (sitemapOpts.changefreq) page.changefreq = sitemapOpts.changefreq
        if (typeof sitemapOpts.priority === 'number') {
          page.priority = sitemapOpts.priority
        }
        pages.push(page)
      }
    }
    const xml = generateSitemap({ baseUrl, pages })
    await fs.writeFile(path.join(outDir, 'sitemap.xml'), xml, 'utf8')
  }

  if (seo.rss) {
    const rssOpts = typeof seo.rss === 'object' ? seo.rss : null
    if (rssOpts === null) {
      warn(
        '[@pyreon/zero-content] `seo.rss: true` requires an object with `collection`/`title` to scope the feed',
      )
    } else {
      const list = entriesByCollection[rssOpts.collection] ?? []
      const publishDate =
        feedContext?.config.collections[rssOpts.collection]?.publishDate
      const collMeta = feedContext?.meta.get(rssOpts.collection)
      const dated = list
        .map((entry) => {
          const url = urlFor(rssOpts.collection, entry.slug)
          if (url === null) return null
          const meta = collMeta?.get(entry.slug)
          const fm = meta?.frontmatter
          const item: RssItem = { title: entry.title, link: url }
          if (entry.description) item.description = entry.description
          const time =
            publishDate !== undefined ? readPublishTime(fm?.[publishDate]) : null
          if (time !== null) item.pubDate = new Date(time).toISOString()
          const tags = fm?.['tags']
          if (Array.isArray(tags) && tags.every((t) => typeof t === 'string')) {
            item.categories = tags as string[]
          }
          if (rssOpts.content === 'full' && meta !== undefined) {
            item.content = markdownToFeedHtml(meta.source, joinUrl(baseUrl, url))
          }

          return { item, time }
        })
        .filter((i): i is NonNullable<typeof i> => i !== null)
      // Newest first when the collection is dated (readers and importers
      // take the head of the feed); otherwise the deterministic slug order.
      if (publishDate !== undefined) {
        dated.sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity))
      }
      const items = dated
        .slice(0, rssOpts.limit ?? dated.length)
        .map((d) => d.item)
      const feedPath = (rssOpts.path ?? 'rss.xml').replace(/^\/+/, '')
      const rssConfig: Parameters<typeof generateRssFeed>[0] = {
        title: rssOpts.title,
        origin: baseUrl,
        items,
        feedUrl: `/${feedPath}`,
      }
      if (rssOpts.description) rssConfig.description = rssOpts.description
      if (rssOpts.language) rssConfig.language = rssOpts.language
      const xml = generateRssFeed(rssConfig)
      const target = path.join(outDir, feedPath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, xml, 'utf8')
    }
  }

  if (seo.llms) {
    const llmsOpts = typeof seo.llms === 'object' ? seo.llms : {}
    const sections = []
    for (const [collection, entries] of Object.entries(entriesByCollection)) {
      const pages = entries
        .map((entry) => {
          const url = urlFor(collection, entry.slug)
          if (url === null) return null
          const page: { title: string; path: string; description?: string } = {
            title: entry.title,
            path: url,
          }
          if (entry.description) page.description = entry.description

          return page
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
      if (pages.length > 0) {
        sections.push({
          name: collection[0]!.toUpperCase() + collection.slice(1),
          pages,
        })
      }
    }
    const llmsArgs: {
      title: string
      baseUrl: string
      sections: typeof sections
      description?: string
    } = {
      title: llmsOpts.title ?? 'Site',
      baseUrl,
      sections,
    }
    if (llmsOpts.description) llmsArgs.description = llmsOpts.description
    // No published page in any collection: an llms.txt would be a bare title
    // with no link, which Lighthouse's `llms-txt` audit fails ("File does not
    // appear to contain any links."). A missing llms.txt is "not applicable"
    // to that audit, so leave it out and say why.
    if (sections.length === 0) {
      warn('[Pyreon] seo.llms: no published entry in any collection, so llms.txt was not written. It is written once a collection has a published entry.')
      return
    }
    const text = generateLlmsTxt(llmsArgs)
    await fs.writeFile(path.join(outDir, 'llms.txt'), text, 'utf8')
  }
}

/**
 * Whether a Vite module id refers to a markdown file we should handle.
 * Strips trailing query/hash before matching the extension.
 *
 * Implemented with string ops rather than a regex so adversarial ids
 * with many `?` / `#` characters can't trigger polynomial backtracking
 * (ReDoS). The `cleaned` value is fed to a simple extension check.
 *
 * @internal exported for testing
 */
export function isMarkdownId(id: string): boolean {
  // Strip from the FIRST `?` or `#` to the end — Vite's id strings have
  // at most one of each (e.g. `/path/to/x.md?raw#anchor`).
  let cleaned = id
  const queryIdx = cleaned.indexOf('?')
  if (queryIdx >= 0) cleaned = cleaned.slice(0, queryIdx)
  const hashIdx = cleaned.indexOf('#')
  if (hashIdx >= 0) cleaned = cleaned.slice(0, hashIdx)
  // Extension check (case-insensitive) — `lastIndexOf` + slice avoids a
  // second regex pass.
  const dotIdx = cleaned.lastIndexOf('.')
  if (dotIdx < 0) return false
  const ext = cleaned.slice(dotIdx + 1).toLowerCase()

  return ext === 'md' || ext === 'mdx'
}

/**
 * Best-effort short path for error messages — keeps the meaningful
 * suffix (after `/src/` if present), avoids dumping a 200-char absolute
 * path into the console.
 *
 * Pre-fix (PR-A audit H5) the only available helper trimmed `id` to
 * the segment after the LAST `/src/` and emitted a bare
 * `src/content/docs/zero.md`. In monorepos with several `src/`
 * segments (`packages/foo/src/...`) the trimmed result was wrong AND
 * not click-resolvable from a terminal at the repo root. `reportPath`
 * below replaces this with a `Vite root`-relative path that IDEs
 * recognise as clickable.
 *
 * Module-private: `reportPath` falls back to it when no Vite root has
 * been resolved yet (config-resolution edge case).
 */
function shortId(id: string): string {
  const idx = id.lastIndexOf('/src/')
  if (idx >= 0) return id.slice(idx + 1)
  return id
}

/**
 * Whether `href` is a relative path (`./` or `../` prefix). Used to
 * decide whether the link/image rewriter should fire. Absolute URLs,
 * protocol-relative URLs, `mailto:`, `tel:`, `data:`, `#anchor`-only
 * fragments, and bare-no-prefix paths all return `false`.
 *
 * @internal exported for testing
 */
export function isRelativePath(href: string): boolean {
  if (!href) return false
  return href.startsWith('./') || href.startsWith('../')
}

/**
 * Build a resolver for `[foo](./bar.md)` style internal links. The
 * resolver returns the route URL for relative `.md`/`.mdx` paths
 * (e.g. `/<collection>/<slug>`), preserves any `#anchor` suffix, and
 * returns `null` for unrecognised shapes so the emitter passes the
 * href through.
 *
 * PR-F audit H8 — pre-fix every `[foo](./bar.md)` shipped as-is and
 * 404'd in production.
 *
 * @internal exported for testing
 */
export function makeInternalLinkResolver(
  fileId: string,
): (href: string) => string | null {
  return (href) => {
    if (!isRelativePath(href)) return null
    // Split off the `#anchor` so we resolve only the path portion.
    let frag = ''
    let pathPart = href
    const hashIdx = href.indexOf('#')
    if (hashIdx >= 0) {
      pathPart = href.slice(0, hashIdx)
      frag = href.slice(hashIdx)
    }
    // Only rewrite `.md` / `.mdx` paths — leave other relative paths
    // (`./schema.json` etc.) untouched.
    if (!/\.(md|mdx)$/i.test(pathPart)) return null
    // Resolve against the current file's directory then strip extension.
    const fileDir = path.dirname(fileId)
    const targetAbs = path.resolve(fileDir, pathPart)
    // Find the `/content/<collection>/` prefix to compute the URL.
    // Mirrors `deriveSlug` but yields the route URL form.
    const norm = targetAbs.split('\\').join('/')
    const lower = norm.toLowerCase()
    const marker = '/content/'
    const idx = lower.indexOf(marker)
    if (idx < 0) return null
    const rel = norm.slice(idx + marker.length).replace(/\.(md|mdx)$/i, '')
    // Collapse `/index` so `docs/index` → `docs`.
    const collapsed = rel.endsWith('/index') ? rel.slice(0, -'/index'.length) : rel
    // The route URL convention is `/<collection-and-rest>` — emit a
    // leading slash so the resulting `<a href>` is absolute.
    return `/${collapsed}${frag}`
  }
}

/**
 * Cheap probe: does the project have any `.md` / `.mdx` files under
 * `src/content/`? Used by `configResolved` to decide whether to warn
 * about a missing `content.config.*` file. Walks a single subtree
 * with a bounded depth so it stays fast on monorepos.
 *
 * @internal exported for testing
 */
export async function hasMarkdownInContentDir(root: string): Promise<boolean> {
  const dir = path.join(root, 'src', 'content')
  const MAX_DEPTH = 4
  const walk = async (
    current: string,
    depth: number,
  ): Promise<boolean> => {
    if (depth > MAX_DEPTH) return false
    let dirents: import('node:fs').Dirent[]
    try {
      dirents = await fsp.readdir(current, { withFileTypes: true })
    } catch {
      return false
    }
    for (const d of dirents) {
      if (d.isFile() && /\.(md|mdx)$/i.test(d.name)) return true
      if (d.isDirectory()) {
        const hit = await walk(path.join(current, d.name), depth + 1)
        if (hit) return true
      }
    }

    return false
  }

  return walk(dir, 0)
}

/**
 * Produce a clickable, repo-relative path for a file id. Prefers the
 * captured Vite root over the last-`/src/`-segment heuristic, prefixes
 * with `./` so terminals recognise it as a path, and normalises
 * Windows separators so the output is consistent across platforms.
 *
 * @internal exported for testing
 */
export function reportPath(id: string): string {
  const root = resolvedRootForPaths()
  if (root) {
    // Strip the root + leading separator, normalise to POSIX-style
    // separators, and stamp a leading `./` so the output is a real
    // relative path (terminals + IDE jump-to-source widgets are
    // happy with `./packages/foo/src/...`).
    //
    // We trim trailing/leading `/` via while-loops rather than regex
    // (`/\/+$/`, `/^\/+/`) — CodeQL flags the quantified char class
    // as "polynomial regex on uncontrolled input" since `id` comes
    // from Vite's file resolver. The replacement is O(n) on the
    // trailing slash count with no engine overhead.
    const normalisedId = id.split('\\').join('/')
    let normalisedRoot = root.split('\\').join('/')
    while (normalisedRoot.endsWith('/')) normalisedRoot = normalisedRoot.slice(0, -1)
    if (
      normalisedId === normalisedRoot ||
      normalisedId.startsWith(normalisedRoot + '/')
    ) {
      let rel = normalisedId.slice(normalisedRoot.length)
      while (rel.startsWith('/')) rel = rel.slice(1)
      return rel.length > 0 ? `./${rel}` : './'
    }
  }

  return shortId(id)
}
