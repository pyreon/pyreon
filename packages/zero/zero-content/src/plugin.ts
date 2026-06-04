import type { Plugin } from 'vite'
import { compileMarkdown } from './pipeline/parse'
import type { HighlighterOptions } from './pipeline/highlighter'

// ─── @pyreon/zero-content Vite plugin ──────────────────────────────────────
//
// Explicit plugin (NOT auto-wired by zero — per the design discussion,
// content is opt-in unlike image/font).
//
// PR 1 scope: register a `transform` hook for `.md` files, emit a `.tsx`
// module via the markdown pipeline.
// PR 2 scope: pass-through Shiki highlighting + callout/codegroup support
// via the remark pipeline.
//
// Future PR scope:
//   PR 3: MDX (JSX-in-markdown) + components convention scan
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
}

/**
 * The Vite plugin. Default export so users write:
 *
 *   import content from '@pyreon/zero-content/plugin'
 *   plugins: [pyreon(), zero(), content()]
 */
export default function content(options: ContentPluginOptions = {}): Plugin {
  return {
    name: 'pyreon-zero-content',
    enforce: 'pre',

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
        return { code: result.code, map: null }
      } catch (err) {
        const message = (err as Error).message
        this.error(
          `[@pyreon/zero-content] failed to compile ${shortId(id)}: ${message}`,
        )
      }
    },
  }
}

/**
 * Whether a Vite module id refers to a markdown file we should handle.
 * Strips trailing query/hash before matching the extension.
 *
 * @internal exported for testing
 */
export function isMarkdownId(id: string): boolean {
  const cleaned = id.replace(/[?#].*$/, '')
  return /\.(md|mdx)$/i.test(cleaned)
}

/**
 * Best-effort short path for error messages — keeps the meaningful
 * suffix (after `/src/` if present), avoids dumping a 200-char absolute
 * path into the console.
 */
function shortId(id: string): string {
  const idx = id.lastIndexOf('/src/')
  if (idx >= 0) return id.slice(idx + 1)
  return id
}
