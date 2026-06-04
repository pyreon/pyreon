import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
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

// Virtual module the plugin serves so markdown can import user-side
// components by name without any wiring. The user puts components in
// `src/mdx/`, the scanner discovers them, the virtual module re-exports
// them, and the markdown→TSX pipeline emits `import { ... } from
// VIRTUAL_COMPONENTS_ID` per file.
export const VIRTUAL_COMPONENTS_ID = 'virtual:zero-content/components'
const RESOLVED_VIRTUAL_COMPONENTS_ID = '\0' + VIRTUAL_COMPONENTS_ID

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
  let cachedScan: ScanResult | null = null
  let scanInFlight: Promise<ScanResult> | null = null

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

  return {
    name: 'pyreon-zero-content',
    enforce: 'pre',

    configResolved(config) {
      resolvedConfig = config
    },

    resolveId(source) {
      if (source === VIRTUAL_COMPONENTS_ID) return RESOLVED_VIRTUAL_COMPONENTS_ID
      return null
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_COMPONENTS_ID) return null
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

        return { code: result.code, map: null }
      } catch (err) {
        const message = (err as Error).message
        this.error(
          `[@pyreon/zero-content] failed to compile ${shortId(id)}: ${message}`,
        )
      }
    },

    async handleHotUpdate(ctx) {
      // Invalidate the virtual components module when any `src/mdx/`
      // source file changes. The next request will trigger a fresh
      // scan + re-render of the module. Vite's module graph propagates
      // the invalidation to every `.md` file that imported it.
      if (!isUnderMdxDir(ctx.file)) return undefined
      cachedScan = null
      const mod = ctx.server.moduleGraph.getModuleById(
        RESOLVED_VIRTUAL_COMPONENTS_ID,
      )
      if (mod) {
        ctx.server.moduleGraph.invalidateModule(mod)
        return [mod, ...ctx.modules]
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
