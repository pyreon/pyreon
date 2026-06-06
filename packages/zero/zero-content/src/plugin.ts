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
// Explicit plugin (NOT auto-wired by zero — per the design discussion,
// content is opt-in unlike image/font).
//
// PR 1 scope: register a `transform` hook for `.md` files, emit a `.tsx`
// module via the markdown pipeline.
// PR 2 scope: pass-through Shiki highlighting + callout/codegroup support
// via the remark pipeline.
// PR 3 scope: MDX (JSX-in-markdown) + the `src/mdx/**/*.tsx` convention
// scanner + the `virtual:zero-content/components` virtual module + HMR
// for `src/mdx/` changes.
//
// Future PR scope:
//   PR 4: collections + zod schemas + catch-all route generation
//   PR 5: search index emission
//   PR 6: sidebar config + JSON Schema for frontmatter

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
        const result = await compileMarkdown(code, id, opts)

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
            this.error(formatValidationError(validation, shortId(id)))
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
                formatSchemaIssues(v.issues, shortId(id), collectionName),
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
            const body = stripMarkdown(code)
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
        return { code: compiled.code, map: null }
      } catch (err) {
        const message = (err as Error).message
        this.error(
          `[@pyreon/zero-content] failed to compile ${shortId(id)}: ${message}`,
        )
      }
    },

    async closeBundle() {
      // Build-time search index emission. Walks the per-collection
      // entries the transform() hook accumulated and writes
      // `dist/search-index.json` (catalog) + `dist/search-index-<name>.json`
      // (per-collection chunk). The runtime <Search> from
      // @pyreon/zero-content/search lazy-fetches the catalog on first
      // Cmd+K open. Closes the "PR 5: search index emission" TODO that
      // shipped at the top of this file.
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
 * @internal exported for testing
 */
export function shortId(id: string): string {
  const idx = id.lastIndexOf('/src/')
  if (idx >= 0) return id.slice(idx + 1)
  return id
}
