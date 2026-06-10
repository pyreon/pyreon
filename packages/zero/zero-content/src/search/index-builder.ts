import { promises as fs } from 'node:fs'
import path from 'node:path'
import MiniSearch from 'minisearch'
import type { CollectionDefinition, ContentConfig } from '../types'

// ─── Build-time search index emission ─────────────────────────────────────
//
// Walks every searchable collection at build time, extracts title +
// description + headings + plain text body, builds a minisearch index,
// writes to `dist/search-index.json`. Large indexes are chunked (one
// JSON per collection) so first-byte download stays small even on
// docs-sized sites.

export interface SearchDoc {
  /** Globally-unique id — typically `<collection>:<slug>`. */
  id: string
  /** Owning collection name. */
  collection: string
  /** Slug within the collection. */
  slug: string
  /** Page title (frontmatter.title or first H1). */
  title: string
  /** Optional description (frontmatter.description). */
  description?: string
  /** Concatenated headings text — boosted at query time. */
  headings: string
  /** Body text, stripped of markdown markers. */
  body: string
  /** Resolved URL for SPA navigation. */
  url: string
}

export interface CollectionEntryForIndex {
  slug: string
  title: string
  description?: string
  headings: string[]
  body: string
  /** URL prefix — defaults to `/<collection>/<slug>` if not provided. */
  url?: string
}

export interface BuildIndexArgs {
  config: ContentConfig
  /** Per-collection entries discovered during the build. */
  entries: Record<string, CollectionEntryForIndex[]>
  /** Vite root — used for resolving output paths. */
  root: string
  /** Output directory (default `<root>/dist`). */
  outDir?: string
  /** Chunk threshold in bytes. Default 300 KB; fail-loud at 1 MB. */
  chunkWarnBytes?: number
  chunkErrorBytes?: number
  /**
   * Vite `base` value (e.g. `/pyreon/`). When the site is
   * deployed under a subpath, the catalog URLs emitted INTO
   * `search-index.json` must be prefixed with this so the browser's
   * `fetch('/search-index-docs.json')` doesn't escape the subpath
   * and 404. Default `/` (no prefix). The base is collapsed to ensure
   * exactly one leading slash and one trailing slash.
   */
  base?: string
}

export interface BuildIndexResult {
  /** Files written. Keyed by collection name; `__main__` is the catalog. */
  files: Record<string, string>
  /** Bytes per file. */
  bytes: Record<string, number>
  /** Warning messages for oversize chunks. */
  warnings: string[]
}

// minisearch's default options tuned for docs prose. Title + headings
// get higher boost than body; results stay relevant on short queries.
//
// Sourced from the shared `_shared/minisearch-options` module so the
// runtime `search-runtime.tsx` consumer ALWAYS gets the same shape —
// MiniSearch's `loadJSON` requires build-time + runtime options to
// match or scoring silently diverges. Pre-fix the two were duplicated
// inline (PR-A audit L12); aligning them is structural here.
import { MINISEARCH_OPTIONS as DEFAULT_MS_OPTIONS } from '../_shared/minisearch-options'

/**
 * Whether a collection is searchable. `data` collections default to
 * `false`; `pages` collections default to `true`. Both can be
 * overridden by setting `searchable` on the collection definition.
 *
 * @internal exported for testing
 */
export function isSearchable(def: CollectionDefinition): boolean {
  if (def.searchable === undefined) return def.type === 'pages'
  return def.searchable
}

/**
 * Build a search document from a collection entry. The body is already
 * plain-text (stripped of markdown markers).
 *
 * @internal exported for testing
 */
export function makeSearchDoc(
  collection: string,
  entry: CollectionEntryForIndex,
): SearchDoc {
  const doc: SearchDoc = {
    id: `${collection}:${entry.slug}`,
    collection,
    slug: entry.slug,
    title: entry.title,
    headings: entry.headings.join(' '),
    body: entry.body,
    url: entry.url ?? `/${collection}/${entry.slug}`,
  }
  if (entry.description !== undefined) doc.description = entry.description
  return doc
}

/**
 * Build the serialised chunk for a collection — a JSON document
 * `{ docs: SearchDoc[] }`. The runtime builds a MiniSearch instance
 * from the loaded docs; this lets us merge across collections without
 * leaning on minisearch's brittle internal-format merge contract.
 *
 * @internal exported for testing
 */
export function buildIndexJson(docs: SearchDoc[]): string {
  return JSON.stringify({ docs })
}

/**
 * Build a MiniSearch index from a list of documents. Shared by build-
 * time (smoke tests) and runtime (live query).
 *
 * @internal exported for testing
 */
export function buildMiniSearch(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const ms = new MiniSearch<SearchDoc>(DEFAULT_MS_OPTIONS)
  ms.addAll(docs)
  return ms
}

/**
 * Build + write the search index. One index per searchable collection;
 * a catalog JSON at the root lists collection names + chunk URLs so the
 * runtime can lazy-load on first query.
 */
export async function buildSearchIndex(
  args: BuildIndexArgs,
): Promise<BuildIndexResult> {
  const outDir = args.outDir ?? path.join(args.root, 'dist')
  await fs.mkdir(outDir, { recursive: true })

  const chunkWarn = args.chunkWarnBytes ?? 300 * 1024
  const chunkError = args.chunkErrorBytes ?? 1024 * 1024

  // Normalize the configured base into the prefix we'll emit into
  // catalog URLs. `'/' → ''` (no prefix needed for root deploys),
  // `'/pyreon/' → '/pyreon'` (kept with exactly one
  // leading slash and NO trailing slash so the `/${filename}` join
  // produces a single slash between prefix and filename).
  let basePrefix = ''
  if (args.base && args.base !== '/' && args.base.length > 0) {
    let b = args.base
    if (!b.startsWith('/')) b = '/' + b
    if (b.endsWith('/')) b = b.slice(0, -1)
    basePrefix = b
  }

  const files: Record<string, string> = {}
  const bytes: Record<string, number> = {}
  const warnings: string[] = []
  const catalog: { collections: Array<{ name: string; url: string }> } = {
    collections: [],
  }

  for (const [name, def] of Object.entries(args.config.collections)) {
    if (!isSearchable(def)) continue
    const entries = args.entries[name] ?? []
    if (entries.length === 0) continue
    const docs = entries.map((entry) => makeSearchDoc(name, entry))
    const json = buildIndexJson(docs)
    const byteSize = Buffer.byteLength(json, 'utf8')
    if (byteSize > chunkError) {
      throw new Error(
        `[@pyreon/zero-content] search index for collection "${name}" is ${humanBytes(byteSize)} (exceeds chunkErrorBytes=${humanBytes(chunkError)}). Reduce collection size or raise the limit.`,
      )
    }
    if (byteSize > chunkWarn) {
      warnings.push(
        `[@pyreon/zero-content] search index for collection "${name}" is ${humanBytes(byteSize)} (over chunkWarnBytes=${humanBytes(chunkWarn)}). Consider splitting the collection or excluding fields.`,
      )
    }
    const filename = `search-index-${name}.json`
    const filepath = path.join(outDir, filename)
    await fs.writeFile(filepath, json, 'utf8')
    files[name] = filepath
    bytes[name] = byteSize
    // Prefix with the configured base (empty for root deploys) so
    // the runtime's `fetch()` lands on the right asset under any
    // subpath deployment.
    catalog.collections.push({ name, url: `${basePrefix}/${filename}` })
  }

  if (catalog.collections.length > 0) {
    const catalogPath = path.join(outDir, 'search-index.json')
    const catalogJson = JSON.stringify(catalog)
    await fs.writeFile(catalogPath, catalogJson, 'utf8')
    files.__main__ = catalogPath
    bytes.__main__ = Buffer.byteLength(catalogJson, 'utf8')
  }

  return { files, bytes, warnings }
}

/**
 * Human-readable byte size. Used for warning + error messages.
 *
 * @internal exported for testing
 */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/**
 * Strip markdown body text down to plain prose. Removes the leading
 * YAML frontmatter block, code fences + inline code, HTML tags, link
 * syntax, headings, inline emphasis markers. Imperfect by design —
 * the goal is to make the indexer's job easier, not to produce a
 * perfect rendition.
 *
 * Pre-fix (PR-D audit C7) the frontmatter block was indexed as part
 * of the body, leaking `title:` / `description:` / `since:` etc. into
 * search results (~12.3 KB on the docs site, mostly weighted prose like
 * descriptions).
 *
 * @internal exported for testing
 */
export function stripMarkdown(source: string): string {
  // Drop the leading frontmatter block `^---\n...\n---\n` (a single
  // YAML header at start of file). We anchor on `^---` and capture up
  // to the next `---` line that's surrounded by line boundaries.
  // Bounded character-class enumeration ensures no polynomial
  // backtracking — the inner pattern matches any character (`[\s\S]`)
  // without a nested quantifier, so a malformed (unclosed) block ends
  // at file end and is trimmed.
  let out = source
  if (out.startsWith('---')) {
    const m = out.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    if (m) out = out.slice(m[0].length)
  }
  // Drop fenced code blocks AND inline code.
  out = out.replace(/```[\s\S]*?```/g, ' ')
  out = out.replace(/`[^`]*`/g, ' ')
  // Drop HTML tags.
  out = out.replace(/<[^>]+>/g, ' ')
  // Drop image/link syntax — keep the text.
  out = out.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Drop heading lines entirely (NOT just the marker) — the heading
  // text is ALREADY stored in the doc's `headings` field, so leaving
  // it in `body` double-indexes it. Pre-fix (PR-D audit C7) the docs site
  // shipped ~26 KB of duplicated heading text across its 93 pages.
  out = out.replace(/^#{1,6}\s+.*$/gm, '')
  // Drop emphasis markers.
  out = out.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
  // Collapse whitespace.
  out = out.replace(/\s+/g, ' ').trim()
  return out
}
