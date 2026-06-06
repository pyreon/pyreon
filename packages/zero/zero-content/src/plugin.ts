import path from 'node:path'
import { transform as esbuildTransform } from 'esbuild'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { compileMarkdown } from './pipeline/parse'
import type { HighlighterOptions } from './pipeline/highlighter'
import {
  renderVirtualModule,
  scanMdxDir,
  type ScanResult,
} from './mdx-scan/scanner'
import {
  extractImportBindings,
  formatValidationError,
  validateComponentRefs,
} from './mdx-scan/validate'
import {
  defaultLoader,
  findConfigFile,
  loadConfig,
  type LoadedConfig,
} from './config-loader'
import {
  buildSearchIndex,
  type CollectionEntryForIndex,
  stripMarkdown,
} from './search/index-builder'
import { renderVirtualCollections } from './virtual-collections'
import { writeContentTypes } from './type-emit/content-types'
import {
  emitFrontmatterSchemas,
  writeVscodeSnippetFile,
} from './type-emit/frontmatter-schema'
import {
  formatSchemaIssues,
  isStandardSchema,
  validateAgainstSchema,
} from './schema-validate'

// ─── @pyreon/zero-content Vite plugin ──────────────────────────────────────
//
// Explicit plugin (NOT auto-wired by zero — content is opt-in, unlike
// image/font/script which are universally beneficial).
//
// Responsibilities:
//   - `transform`        — compile `.md` / `.mdx` to a `.tsx` module via
//                          the markdown pipeline; emit a build-time
//                          search index entry per page
//   - `resolveId` / `load` — serve the two virtual modules:
//                            * `virtual:zero-content/components`
//                            * `virtual:zero-content/collections`
//   - `configResolved`   — auto-discover + load `content.config.{ts,...}`,
//                          stamp Vite root for diagnostics path-labels
//   - `buildStart`       — clear per-build state (SSG inner sub-build
//                          reuses the plugin instance)
//   - `closeBundle`      — emit `dist/search-index*.json`
//   - `handleHotUpdate`  — invalidate the components virtual module on
//                          `src/mdx/` edits; invalidate `content-types.d.ts`
//                          on `content.config.ts` edits

export interface ContentPluginOptions {
  /**
   * Disable Shiki code highlighting. Default: enabled.
   *
   * Highlighting is a build-time cost only — the SSR output ships
   * pre-rendered HTML with no Shiki runtime — so the default is on.
   * Set to `false` when running tests or building a quick preview
   * where un-highlighted code is acceptable.
   */
  highlight?: boolean
  /**
   * Shiki configuration (themes + languages). Passed through to the
   * shared highlighter instance. See `highlighter.ts` for defaults.
   */
  highlighter?: HighlighterOptions
  /**
   * Override the `src/mdx/` scan directory. Useful for tests + projects
   * with non-standard structure. Default: `path.join(config.root, 'src', 'mdx')`.
   */
  mdxDir?: string
  /**
   * Skip the final esbuild JSX→h() pass. Tests assert on the raw
   * emit-jsx output; production builds always want the JSX compiled.
   * Default: `true` (compile JSX).
   */
  compileJsx?: boolean
  /**
   * Maximum body length (in characters) indexed per page for search.
   * Pre-fix (PR-D audit M23) this was a hardcoded 1500 with no
   * configuration surface and no log of pages truncated, so authors
   * had no way to discover that content past the first ~1500 chars
   * never appeared in search results.
   *
   * Defaults remain 1500 to keep the docs-zero shipped index size
   * within the existing 300 KB warn threshold. Set higher for blog
   * collections that lean on full-text recall; set to `Infinity` to
   * disable truncation entirely (the chunkWarn / chunkError bounds
   * still apply at the per-collection JSON level).
   */
  searchBodyMax?: number
}

// Virtual modules the plugin serves.
//
//   - `virtual:zero-content/components` — re-exports every component
//     discovered in `src/mdx/`. Markdown auto-imports from this module
//     for any uppercase JSX tag.
//   - `virtual:zero-content/collections` — runtime registry that
//     `getCollection` / `getEntry` read from. Uses `import.meta.glob`
//     to lazy-load each collection's entries.
export const VIRTUAL_COMPONENTS_ID = 'virtual:zero-content/components'
const RESOLVED_VIRTUAL_COMPONENTS_ID = '\0' + VIRTUAL_COMPONENTS_ID
export const VIRTUAL_COLLECTIONS_ID = 'virtual:zero-content/collections'
const RESOLVED_VIRTUAL_COLLECTIONS_ID = '\0' + VIRTUAL_COLLECTIONS_ID

// ─── Cross-build cache for the markdown pipeline ──────────────────────────
//
// PR-A audit C2 — pre-fix the markdown pipeline ran TWICE per build:
// once for the outer client build, once for the SSG inner SSR sub-build.
// Both invocations have their own plugin instance (so per-instance state
// can't bridge), but they share the same Node process (the SSG inner
// build is spawned via `buildSsrBundle`, not a child process). A module-
// level cache survives across plugin-instance boundaries within the
// process and lets the second transform skip remark + Shiki entirely.
//
// Cache key combines:
//   - the file id (so two `.md` files with identical content don't
//     collide on slug derivation),
//   - a FNV-1a hash of the source code (HMR + content changes invalidate
//     naturally),
//   - a hash of the highlight/highlighter options (a theme swap in
//     `content.config.ts` reaches us as a different opts shape, so the
//     cache key shifts and the entry rebuilds).
//
// The cache holds the FINAL esbuild-compiled output so we skip BOTH the
// remark pass AND the esbuild JSX→h() pass on the hit path. Storage is a
// plain `Map` with a soft cap — the per-build entry count is bounded by
// the markdown-file count, so unbounded growth in long-lived processes
// (e.g. dev server) is the only concern; the LRU cap addresses that.
interface CompiledCacheEntry {
  code: string
  componentRefs: string[]
  hoistedEsm: string[]
  frontmatter: Record<string, unknown>
  headings: Array<{ level: number; text: string; slug: string }>
  slug: string
  /** Original source — used to populate the search-index body that the
   * cached-path skip would otherwise miss. */
  source: string
}

const COMPILE_CACHE = new Map<string, CompiledCacheEntry>()
const COMPILE_CACHE_LIMIT = 4096

/** FNV-1a 32-bit string hash. Cheap, allocation-free, good enough for
 * cache discrimination — we want fast equality buckets, not crypto. */
function fnv1aHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(36)
}

function computeCompileCacheKey(
  id: string,
  code: string,
  opts: import('./pipeline/parse').CompileOptions,
  compileJsxEnabled: boolean,
): string {
  // `JSON.stringify(opts)` is cheap because opts is shallow; the same
  // value passed every transform produces the same key string.
  const optsKey = JSON.stringify({
    h: opts.highlight ?? null,
    hl: opts.highlighter ?? null,
    j: compileJsxEnabled,
  })
  return `${id}|${code.length}|${fnv1aHash(code)}|${fnv1aHash(optsKey)}`
}

function setCompileCacheEntry(key: string, entry: CompiledCacheEntry): void {
  if (COMPILE_CACHE.size >= COMPILE_CACHE_LIMIT) {
    // Trim the oldest insertion (Map preserves insertion order).
    const firstKey = COMPILE_CACHE.keys().next().value
    if (firstKey !== undefined) COMPILE_CACHE.delete(firstKey)
  }
  COMPILE_CACHE.set(key, entry)
}

/** Test-only — wipe the cross-build cache so suites don't leak state. */
export function _resetCompileCacheForTesting(): void {
  COMPILE_CACHE.clear()
}

/**
 * The Vite plugin. Default export so users write:
 *
 *   import content from '@pyreon/zero-content/plugin'
 *   plugins: [pyreon(), zero(), content()]
 */
export default function content(options: ContentPluginOptions = {}): Plugin {
  // Shared state across the plugin's hooks: the resolved config (root +
  // server reference for invalidation), the cached scan result, and a
  // single in-flight scan promise so concurrent virtual-module loads
  // don't trigger N concurrent scans.
  let resolvedConfig: ResolvedConfig | null = null
  let viteServer: ViteDevServer | null = null
  let cachedScan: ScanResult | null = null
  let scanInFlight: Promise<ScanResult> | null = null
  let loadedConfig: LoadedConfig | null = null
  // Per-collection entries accumulated by transform() for the build-time
  // search index. Populated for every .md/.mdx under a collection path;
  // consumed once in closeBundle to write dist/search-index.json +
  // dist/search-index-<collection>.json files. Cleared per build via
  // buildStart so dev → build doesn't carry stale dev-mode entries.
  const searchEntries: Map<string, Map<string, CollectionEntryForIndex>> =
    new Map()

  const getMdxDir = (): string => {
    if (options.mdxDir) return options.mdxDir
    const root = resolvedConfig?.root ?? process.cwd()
    return path.join(root, 'src', 'mdx')
  }

  const performScan = async (): Promise<ScanResult> => {
    const scan = await scanMdxDir(getMdxDir())
    cachedScan = scan
    return scan
  }

  const ensureScan = async (): Promise<ScanResult> => {
    if (cachedScan) return cachedScan
    if (!scanInFlight) {
      scanInFlight = performScan().finally(() => {
        scanInFlight = null
      })
    }
    return scanInFlight
  }

  const isUnderMdxDir = (file: string): boolean => {
    const mdxDir = getMdxDir()
    const rel = path.relative(mdxDir, file)
    return !rel.startsWith('..') && !path.isAbsolute(rel)
  }

  const maybeEmitTypes = async (cfg: LoadedConfig): Promise<void> => {
    if (!resolvedConfig) return
    await writeContentTypes({
      root: resolvedConfig.root,
      configFile: cfg.configFile,
      collectionNames: Object.keys(cfg.config.collections),
    })
    // Frontmatter JSON Schema + .vscode-settings snippet — written
    // alongside content-types.d.ts so the consumer's tsconfig + IDE
    // setup picks them up automatically.
    try {
      const artifacts = await emitFrontmatterSchemas({
        config: cfg.config,
        root: resolvedConfig.root,
      })
      await writeVscodeSnippetFile(
        { config: cfg.config, root: resolvedConfig.root },
        artifacts,
      )
    } catch {
      // Schema emission is best-effort. Failures don't block the build.
    }
  }

  /**
   * Look up which collection (if any) the given markdown file belongs
   * to. Used by `transform` to apply the right schema.
   *
   * Match by path-prefix — every collection has a `path` (default
   * `src/content/<name>`). The first collection whose path is a prefix
   * of `id` wins.
   */
  const findCollectionForFile = (id: string): string | null => {
    if (loadedConfig === null) return null
    const root = resolvedConfig?.root ?? process.cwd()
    for (const [name, def] of Object.entries(loadedConfig.config.collections)) {
      const collectionPath = def.path ?? `src/content/${name}`
      const abs = path.isAbsolute(collectionPath)
        ? collectionPath
        : path.join(root, collectionPath)
      const rel = path.relative(abs, id)
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) return name
    }
    return null
  }

  return {
    name: 'pyreon-zero-content',
    enforce: 'pre',

    async configResolved(config) {
      resolvedConfig = config
      // Record root for `reportPath` so plugin diagnostics carry
      // clickable Vite-root-relative paths (PR-A audit H5). Pre-fix
      // `shortId` stripped to the last `/src/` segment, which broke
      // click-to-open in monorepos with several `src/` directories.
      _setResolvedRootForPaths(config.root)
      // Try to load content.config.{ts,...} at configResolved time so
      // the rest of the plugin has the collection map ready before any
      // transform fires. The default loader (dynamic import) works for
      // `.js` / `.mjs`; `.ts` is loaded via Vite's ssrLoadModule once
      // the dev server is available (handled in configureServer).
      const configFile = await findConfigFile(config.root)
      if (configFile === null) return
      // For `.js` / `.mjs` we can load right away.
      if (/\.(m?js)$/.test(configFile)) {
        try {
          loadedConfig = await loadConfig(config.root, defaultLoader)
          if (loadedConfig) await maybeEmitTypes(loadedConfig)
        } catch (err) {
          config.logger.warn(
            `[@pyreon/zero-content] Failed to load content config: ${(err as Error).message}`,
          )
        }
      }
    },

    async configureServer(server) {
      viteServer = server
      // For `.ts` / `.mts` configs we need Vite's ssrLoadModule so
      // TypeScript transforms apply. Now's the time.
      if (loadedConfig === null && resolvedConfig) {
        try {
          loadedConfig = await loadConfig(
            resolvedConfig.root,
            async (file) =>
              server.ssrLoadModule(file) as Promise<{ default?: unknown }>,
          )
          if (loadedConfig) await maybeEmitTypes(loadedConfig)
        } catch (err) {
          server.config.logger.warn(
            `[@pyreon/zero-content] Failed to load content config: ${(err as Error).message}`,
          )
        }
      }
    },

    async buildStart() {
      // Clear stale per-build state. Vite reuses the plugin instance
      // across consecutive builds (e.g. SSG's inner SSR sub-build);
      // without this, a fresh build inherits the previous run's
      // searchEntries and emits duplicate / stale documents.
      searchEntries.clear()
      // Build mode (not dev) needs an ssrLoadModule fallback too. We
      // use Rollup's resolution by importing the file directly via
      // `import()`. This works when the consumer's bundler can resolve
      // their content.config.ts (Vite always can, since it sets up the
      // esbuild loader at process boot).
      if (loadedConfig === null && resolvedConfig) {
        try {
          loadedConfig = await loadConfig(
            resolvedConfig.root,
            defaultLoader,
          )
          if (loadedConfig) await maybeEmitTypes(loadedConfig)
        } catch {
          // Silently skip — `.ts` configs in non-Vite contexts are out
          // of scope for the default loader. The user gets a clearer
          // error from `getCollection` at query time.
        }
      }
    },

    resolveId(source) {
      if (source === VIRTUAL_COMPONENTS_ID) return RESOLVED_VIRTUAL_COMPONENTS_ID
      if (source === VIRTUAL_COLLECTIONS_ID) return RESOLVED_VIRTUAL_COLLECTIONS_ID
      return null
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_COMPONENTS_ID) {
        const scan = await ensureScan()
        // Surface duplicates as a build-time error so users notice them.
        // `this.warn` is enough at the plugin level — it shows in Vite's
        // dev console and CI build log.
        if (scan.duplicates.length > 0) {
          for (const dup of scan.duplicates) {
            this.warn(
              `[@pyreon/zero-content] Duplicate component name "${dup.name}" found in: ${dup.files.join(', ')}. Only the first is exposed via virtual:zero-content/components; rename one to disambiguate.`,
            )
          }
        }
        return renderVirtualModule(scan)
      }
      if (id === RESOLVED_VIRTUAL_COLLECTIONS_ID) {
        if (loadedConfig === null) {
          // No content.config — emit an empty registry so the runtime
          // throws an instructive error if someone calls getCollection.
          return `// Auto-generated by @pyreon/zero-content. No content.config found.
import { _setRegistry } from '@pyreon/zero-content'
_setRegistry({})
export {}
`
        }
        return renderVirtualCollections({
          config: loadedConfig.config,
          root: resolvedConfig?.root ?? process.cwd(),
        })
      }
      return null
    },

    async transform(code, id) {
      // Only transform `.md` / `.mdx` files. The check uses `.md` /
      // `.mdx` boundary so query-suffixed imports (e.g. `?raw`) don't
      // accidentally match.
      if (!isMarkdownId(id)) return null
      try {
        // `exactOptionalPropertyTypes` — only set keys when the
        // value isn't `undefined`, otherwise we'd be widening the
        // CompileOptions field type.
        const opts: import('./pipeline/parse').CompileOptions = {}
        if (options.highlight !== undefined) opts.highlight = options.highlight
        if (options.highlighter !== undefined)
          opts.highlighter = options.highlighter
        const compileJsxEnabled = options.compileJsx !== false
        const cacheKey = computeCompileCacheKey(id, code, opts, compileJsxEnabled)
        const cached = COMPILE_CACHE.get(cacheKey)

        // Cache HIT — pre-pulled `code` for the inner SSR sub-build,
        // OR a repeated transform of an unchanged file. Skip remark +
        // Shiki + esbuild entirely. We still need to keep the search-
        // index population path consistent for the OUTER client build,
        // but the inner SSR build's `searchEntries` map is discarded
        // (only the outer's `closeBundle` writes the index), so on the
        // cache-hit path we ONLY populate when no entry exists yet for
        // this collection+slug.
        if (cached !== undefined) {
          // Re-run the search-index stash for the outer build's first
          // pass IF it wasn't already populated. Cheap structural work
          // — no remark/Shiki.
          if (resolvedConfig?.command === 'build') {
            const collectionName = findCollectionForFile(id)
            if (collectionName !== null && loadedConfig) {
              const collMap = searchEntries.get(collectionName)
              const collectionPath =
                loadedConfig.config.collections[collectionName]!.path ??
                `src/content/${collectionName}`
              const absCollectionPath = path.isAbsolute(collectionPath)
                ? collectionPath
                : path.join(resolvedConfig.root, collectionPath)
              const slug = path
                .relative(absCollectionPath, id)
                .replace(/\.(md|mdx)$/, '')
                .split(path.sep)
                .join('/')
              if (!collMap || !collMap.has(slug)) {
                const frontmatter = cached.frontmatter
                const title = String(frontmatter.title ?? slug)
                const description =
                  typeof frontmatter.description === 'string'
                    ? frontmatter.description
                    : undefined
                const headings = (cached.headings ?? []).map((h) => h.text)
                const SEARCH_BODY_MAX = options.searchBodyMax ?? 1500
                let body = stripMarkdown(cached.source)
                if (body.length > SEARCH_BODY_MAX) {
                  const slice = body.slice(0, SEARCH_BODY_MAX)
                  const lastSpace = slice.lastIndexOf(' ')
                  body =
                    lastSpace > SEARCH_BODY_MAX * 0.8
                      ? slice.slice(0, lastSpace)
                      : slice
                }
                let m = collMap
                if (!m) {
                  m = new Map<string, CollectionEntryForIndex>()
                  searchEntries.set(collectionName, m)
                }
                const entry: CollectionEntryForIndex = {
                  slug,
                  title,
                  headings,
                  body,
                  url: `/${collectionName}/${slug}`,
                }
                if (description !== undefined) entry.description = description
                m.set(slug, entry)
              }
            }
          }
          return { code: cached.code, map: null }
        }

        const result = await compileMarkdown(code, id, opts)

        // Surface non-fatal compile warnings (unknown directive name
        // typos with "did you mean…?" hints + the unclosed-`:::`
        // heuristic from `remark-callout`). Each is piped through
        // `this.warn` so Vite + the dev server show the file path
        // clickably. Pre-fix (PR-A audit C9 + H6) these failed
        // silently — `:::warn` became visible literal text and
        // `:::tip` without `:::` ate the rest of the file.
        for (const w of result.warnings) {
          this.warn(`${w} (${reportPath(id)})`)
        }

        // Validate component references against built-ins + scan +
        // hoisted imports. Unknown names → build error with a
        // did-you-mean hint.
        if (result.componentRefs.length > 0) {
          const scan = await ensureScan()
          const hoistedNames = result.hoistedEsm.flatMap(extractImportBindings)
          const validation = validateComponentRefs({
            scannedNames: scan.components.map((c) => c.name),
            hoistedNames,
            referencedNames: result.componentRefs,
          })
          if (!validation.ok) {
            this.error(formatValidationError(validation, reportPath(id)))
          }
        }

        // Validate frontmatter against the owning collection's schema.
        // Errors halt the build with a path-prefixed message naming
        // every issue (path + message).
        const collectionName = findCollectionForFile(id)
        if (collectionName !== null && loadedConfig) {
          const def = loadedConfig.config.collections[collectionName]!
          if (isStandardSchema(def.schema)) {
            const v = await validateAgainstSchema(
              def.schema,
              result.frontmatter,
            )
            if (!v.ok) {
              this.error(
                formatSchemaIssues(v.issues, reportPath(id), collectionName),
              )
            }
          }
          // Stash the entry for build-time search index emission. The
          // body text comes from the ORIGINAL markdown source (not the
          // JSX-compiled output) — `stripMarkdown` undoes code fences,
          // HTML tags, link syntax, headings, and emphasis markers.
          // Skipped when the collection opts out of search (data
          // collections default to non-searchable; pages default in).
          // Skipped in dev because the catalog write happens in
          // closeBundle which Vite only fires in build mode anyway.
          if (resolvedConfig?.command === 'build') {
            const collectionPath =
              loadedConfig.config.collections[collectionName]!.path ??
              `src/content/${collectionName}`
            const absCollectionPath = path.isAbsolute(collectionPath)
              ? collectionPath
              : path.join(resolvedConfig.root, collectionPath)
            const slug = path
              .relative(absCollectionPath, id)
              .replace(/\.(md|mdx)$/, '')
              .split(path.sep)
              .join('/')
            const frontmatter = result.frontmatter as Record<string, unknown>
            const title = String(frontmatter.title ?? slug)
            const description =
              typeof frontmatter.description === 'string'
                ? frontmatter.description
                : undefined
            const headings = (result.headings ?? []).map((h) => h.text)
            // Truncate body to first ~1500 chars for the search index.
            // Reasons: (a) most search hits are in title / headings /
            // description (which are boosted at query time anyway); (b)
            // the full body for a 91-page docs site is 700KB+ which
            // exceeds the plugin's 300KB warn threshold and ships a
            // noticeable client-side payload on Cmd+K open.
            //
            // Cut at the nearest word boundary so MiniSearch's
            // tokenizer doesn't see a half-truncated token. The const
            // could move to ContentPluginOptions when a real use case
            // for tuning per project surfaces; 1500 covers the average
            // first-section ("the lede") for most technical docs.
            const SEARCH_BODY_MAX = options.searchBodyMax ?? 1500
            let body = stripMarkdown(code)
            if (body.length > SEARCH_BODY_MAX) {
              const slice = body.slice(0, SEARCH_BODY_MAX)
              const lastSpace = slice.lastIndexOf(' ')
              body = lastSpace > SEARCH_BODY_MAX * 0.8 ? slice.slice(0, lastSpace) : slice
            }
            let collMap = searchEntries.get(collectionName)
            if (!collMap) {
              collMap = new Map<string, CollectionEntryForIndex>()
              searchEntries.set(collectionName, collMap)
            }
            const entry: CollectionEntryForIndex = {
              slug,
              title,
              headings,
              body,
              url: `/${collectionName}/${slug}`,
            }
            if (description !== undefined) entry.description = description
            collMap.set(slug, entry)
          }
        }

        // Compile the emitted JSX to plain JS (h() calls). Downstream
        // tooling sees the original .md/.mdx extension and won't run
        // its own JSX transform; we run esbuild here so the module is
        // bundle-ready out of the box.
        //
        // We emit `h(...)` calls + `Fragment` markers — Pyreon's `h`
        // takes (tag, props, ...children) just like React's
        // `createElement`, so the esbuild-emitted call shape works
        // unmodified. The markdown body doesn't contain user-written
        // signal-driven JSX (just structural article wrappers around
        // compiled prose), so the @pyreon/vite-plugin signal auto-call
        // optimization isn't needed here.
        if (options.compileJsx === false) {
          // Cache the JSX-only output so a repeat compile (or the inner
          // SSR sub-build) re-uses it (PR-A audit C2 — the markdown
          // pipeline used to run twice per SSG build).
          setCompileCacheEntry(cacheKey, {
            code: result.code,
            componentRefs: result.componentRefs,
            hoistedEsm: result.hoistedEsm,
            frontmatter: result.frontmatter,
            headings: result.headings,
            slug: result.slug,
            source: code,
          })
          return { code: result.code, map: null }
        }
        const compiled = await esbuildTransform(result.code, {
          loader: 'tsx',
          jsx: 'transform',
          jsxFactory: 'h',
          jsxFragment: 'Fragment',
          format: 'esm',
          target: 'esnext',
          banner: `import { h, Fragment } from '@pyreon/core'`,
        })
        setCompileCacheEntry(cacheKey, {
          code: compiled.code,
          componentRefs: result.componentRefs,
          hoistedEsm: result.hoistedEsm,
          frontmatter: result.frontmatter,
          headings: result.headings,
          slug: result.slug,
          source: code,
        })
        return { code: compiled.code, map: null }
      } catch (err) {
        const message = (err as Error).message
        this.error(
          `[@pyreon/zero-content] failed to compile ${reportPath(id)}: ${message}`,
        )
      }
    },

    async closeBundle() {
      // Build-time search index emission. Walks the per-collection
      // entries the transform() hook accumulated and writes
      // `dist/search-index.json` (catalog) + `dist/search-index-<name>.json`
      // (per-collection chunk). The runtime <Search> from
      // @pyreon/zero-content/search lazy-fetches the catalog on first
      // Cmd+K open.
      //
      // Build mode only — dev mode does nothing (no closeBundle fires
      // for `vite dev`). SSR sub-builds skip via `command !== 'build'`
      // check at the transform-collection step.
      if (!loadedConfig || resolvedConfig?.command !== 'build') return
      if (searchEntries.size === 0) return
      const outDir = path.join(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
      )
      // Walk each collection's accumulated entries, sorted by slug for
      // deterministic output (same slug order across builds keeps git
      // diffs minimal if the artifact ever gets committed).
      const entriesByCollection: Record<string, CollectionEntryForIndex[]> = {}
      for (const [name, m] of searchEntries.entries()) {
        entriesByCollection[name] = Array.from(m.values()).sort((a, b) =>
          a.slug.localeCompare(b.slug),
        )
      }
      try {
        const result = await buildSearchIndex({
          config: loadedConfig.config,
          entries: entriesByCollection,
          root: resolvedConfig.root,
          outDir,
        })
        for (const w of result.warnings) {
          this.warn(w)
        }
      } catch (err) {
        this.error(
          `[@pyreon/zero-content] failed to write search index: ${(err as Error).message}`,
        )
      }
    },

    async handleHotUpdate(ctx) {
      // 1. src/mdx/ — invalidate the components virtual module.
      if (isUnderMdxDir(ctx.file)) {
        cachedScan = null
        const mod = ctx.server.moduleGraph.getModuleById(
          RESOLVED_VIRTUAL_COMPONENTS_ID,
        )
        if (mod) {
          ctx.server.moduleGraph.invalidateModule(mod)
          return [mod, ...ctx.modules]
        }
        return undefined
      }
      // 2. content.config — re-load the config, re-emit types, and
      // invalidate the collections virtual module. Dependent .md files
      // get re-validated automatically because Vite propagates the
      // collection-module invalidation through their import graph.
      if (loadedConfig && ctx.file === loadedConfig.configFile) {
        try {
          loadedConfig = await loadConfig(
            resolvedConfig?.root ?? process.cwd(),
            async (file) => {
              if (viteServer) {
                return viteServer.ssrLoadModule(file) as Promise<{
                  default?: unknown
                }>
              }
              return defaultLoader(file)
            },
          )
          if (loadedConfig) await maybeEmitTypes(loadedConfig)
        } catch (err) {
          ctx.server.config.logger.warn(
            `[@pyreon/zero-content] Failed to reload content config on HMR: ${(err as Error).message}`,
          )
        }
        const mod = ctx.server.moduleGraph.getModuleById(
          RESOLVED_VIRTUAL_COLLECTIONS_ID,
        )
        if (mod) {
          ctx.server.moduleGraph.invalidateModule(mod)
          return [mod, ...ctx.modules]
        }
        return undefined
      }
      return undefined
    },
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
 * Kept exported for back-compat with downstream code that may have
 * imported it; new call sites should use `reportPath` (which falls
 * back to this when no root is known).
 *
 * @internal exported for testing
 * @deprecated prefer `reportPath(id, root)` — `shortId` is left in for
 *   back-compat and as a fallback used by `reportPath` when no Vite
 *   root has been resolved yet (config-resolution edge case).
 */
export function shortId(id: string): string {
  const idx = id.lastIndexOf('/src/')
  if (idx >= 0) return id.slice(idx + 1)
  return id
}

let _resolvedRootForPaths: string | null = null

/**
 * Record the resolved Vite root so `reportPath` can produce
 * repo-relative paths in plugin error messages. Called from
 * `configResolved`. Pure side-effect; pure read at error-emission.
 *
 * @internal exported for testing
 */
export function _setResolvedRootForPaths(root: string | null): void {
  _resolvedRootForPaths = root
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
  const root = _resolvedRootForPaths
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
