import path from 'node:path'
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
        }

        return { code: result.code, map: null }
      } catch (err) {
        const message = (err as Error).message
        this.error(
          `[@pyreon/zero-content] failed to compile ${shortId(id)}: ${message}`,
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
