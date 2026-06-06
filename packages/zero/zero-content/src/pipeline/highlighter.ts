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

/**
 * Themes accepted by Shiki — either a string name (one of the bundled
 * themes shipped with Shiki) or a `ThemeRegistrationAny` object for
 * fully-custom themes. The pyreon docs site (docs-zero) uses the
 * latter to register its own brand-matched theme alongside the bundled
 * github-light / github-dark options.
 *
 * `ThemeRegistrationAny` from Shiki is a wide union — using `unknown`
 * here as a forward-compatible type that accepts both strings and
 * theme objects. Shiki's own `createHighlighter` signature accepts
 * `BundledTheme | ThemeInput`.
 */
export type ShikiTheme = string | Record<string, unknown>

export interface HighlighterOptions {
  themes?: { light: ShikiTheme; dark: ShikiTheme }
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
// Cache key — `JSON.stringify(opts)` of the call that initialised
// `_highlighter`. When the caller changes themes / langs the key
// diverges and the cached instance is disposed and rebuilt. Pre-fix
// (PR-A audit C10) the first call won FOREVER — `theme: 'pyreon-dark'`
// edits in `content.config.ts` were ignored until a full dev-server
// restart.
let _cacheKey: string | null = null

/**
 * Stable, order-independent key for `HighlighterOptions`. We do NOT
 * use `JSON.stringify(opts)` directly because the theme value can be
 * a non-trivially-stringifiable `ThemeRegistrationRaw` object (the
 * brand themes in `examples/docs-zero/src/styles/pyreon-syntax.ts`)
 * carrying nested `settings` arrays whose stringification is large
 * but stable. We DO stringify it — the only risk is throw on a cycle,
 * which Shiki theme shapes don't have — but we sort keys first so
 * the cache key is identical for `{ light: a, dark: b }` and
 * `{ dark: b, light: a }`. Themes referenced by name (`'github-dark'`)
 * stringify to literal strings, which is cheap.
 *
 * @internal exported for testing
 */
export function computeHighlighterCacheKey(opts: HighlighterOptions): string {
  return JSON.stringify(
    { themes: opts.themes ?? null, langs: opts.langs ?? null },
    (_, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const sorted: Record<string, unknown> = {}
        for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k]
        return sorted
      }
      return v
    },
  )
}

/**
 * Get the shared highlighter, initializing it on first call. Returns a
 * Promise — Shiki's init is async because it loads grammars from the
 * filesystem (or via wasm).
 *
 * Multiple concurrent calls share one init Promise — no duplicate
 * loading. Calls with a DIFFERENT `opts` shape (e.g. swapping themes
 * from `content.config.ts` HMR) dispose the cached instance and
 * rebuild — fixes PR-A audit C10 where the first call's themes were
 * sticky for the process lifetime.
 */
export function getHighlighter(opts: HighlighterOptions = {}): Promise<Highlighter> {
  const key = computeHighlighterCacheKey(opts)
  if (_highlighter && _cacheKey === key) return Promise.resolve(_highlighter)
  if (_initPromise && _cacheKey === key) return _initPromise
  // Different opts than the cached/initializing instance — tear down
  // the old one and rebuild. The previous Promise (if any) still
  // resolves to the old instance for its existing callers; the next
  // call lands on the NEW _initPromise.
  if (_highlighter) {
    _highlighter.dispose()
    _highlighter = null
  }
  _cacheKey = key
  const themes = opts.themes ?? DEFAULT_THEMES
  const langs = opts.langs ?? DEFAULT_LANGS
  _initPromise = createHighlighter({
    // Cast through `never[]` because Shiki's overloaded signature wants
    // a tuple of bundled-theme names OR `ThemeInput` objects; our union
    // type isn't precise enough for the overload resolver.
    themes: [themes.light, themes.dark] as never[],
    langs,
  }).then((h) => {
    _highlighter = h
    _initPromise = null
    return h
  })
  return _initPromise
}

/**
 * Get the theme NAME from a theme value — strings are returned as-is,
 * theme objects have their `name` property extracted. Shiki's
 * `codeToHtml` references themes by name from those registered in
 * `createHighlighter`, so the name lookup happens once per theme arg.
 */
function themeName(theme: ShikiTheme): string {
  if (typeof theme === 'string') return theme
  const n = (theme as { name?: unknown }).name
  return typeof n === 'string' ? n : 'unknown'
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
  _cacheKey = null
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
    // codeToHtml references themes by NAME from the set registered in
    // createHighlighter. For string themes that's the same value; for
    // custom theme objects extract the .name property.
    themes: { light: themeName(themes.light), dark: themeName(themes.dark) },
  })
}
