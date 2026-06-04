import { createHighlighter, type Highlighter } from 'shiki'

// ─── Shiki integration ────────────────────────────────────────────────────
//
// One shared `Highlighter` instance per build (Shiki initialization
// loads grammars + theme files — expensive enough that re-creating per
// `.md` file would dominate the build time on a docs-sized site).
//
// Themes default to `github-light` + `github-dark` — proven, well-
// tested, and the existing examples/docs-pyreon prototype uses them.
// Custom Pyreon-branded themes can land as a follow-up; the highlighter
// accepts arbitrary theme objects via the `themes` option.
//
// Languages: a curated set covering the docs site's needs. Users can
// extend via the plugin config (PR 3+) without forking this file.

export interface HighlighterOptions {
  themes?: { light: string; dark: string }
  langs?: string[]
}

const DEFAULT_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'jsonc',
  'bash',
  'shell',
  'html',
  'css',
  'scss',
  'markdown',
  'mdx',
  'yaml',
  'toml',
  'diff',
  'text',
]

const DEFAULT_THEMES = { light: 'github-light', dark: 'github-dark' }

let _highlighter: Highlighter | null = null
let _initPromise: Promise<Highlighter> | null = null

/**
 * Get the shared highlighter, initializing it on first call. Returns a
 * Promise — Shiki's init is async because it loads grammars from the
 * filesystem (or via wasm).
 *
 * Multiple concurrent calls share one init Promise — no duplicate
 * loading.
 */
export function getHighlighter(opts: HighlighterOptions = {}): Promise<Highlighter> {
  if (_highlighter) return Promise.resolve(_highlighter)
  if (_initPromise) return _initPromise
  const themes = opts.themes ?? DEFAULT_THEMES
  const langs = opts.langs ?? DEFAULT_LANGS
  _initPromise = createHighlighter({
    themes: [themes.light, themes.dark],
    langs,
  }).then((h) => {
    _highlighter = h
    _initPromise = null
    return h
  })
  return _initPromise
}

/**
 * Reset the shared highlighter. Test-only — production code should
 * never call this; the highlighter is supposed to live for the whole
 * build.
 *
 * @internal exported for testing
 */
export function _resetHighlighterForTesting(): void {
  if (_highlighter) {
    _highlighter.dispose()
    _highlighter = null
  }
  _initPromise = null
}

/**
 * Highlight a code block to HTML using the shared highlighter. Returns
 * a `<pre>...</pre>` string with both light + dark themes baked into
 * inline styles + CSS variables (the standard Shiki dual-theme output).
 *
 * Language fallback: unknown languages render as `text` (Shiki throws
 * otherwise). Empty / undefined lang → `text`.
 */
export async function highlightCode(
  code: string,
  lang: string | undefined,
  opts: HighlighterOptions = {},
): Promise<string> {
  const themes = opts.themes ?? DEFAULT_THEMES
  const h = await getHighlighter(opts)
  const effectiveLang = lang && h.getLoadedLanguages().includes(lang as never) ? lang : 'text'
  return h.codeToHtml(code, {
    lang: effectiveLang,
    themes: { light: themes.light, dark: themes.dark },
  })
}
