import { syntax } from '../site/theme'

/**
 * `pyreon` syntax themes — TS/JSX, dark + light.
 *
 * The colours come from `site/theme.ts` (`syntax`), the only place a hex
 * lives. Shiki resolves colours at build time, so it cannot read CSS
 * variables: it emits both themes per token and the page's `data-theme`
 * picks one.
 */
// Inline the shape we use rather than importing `shiki` as a type-only
// dep. Shiki is a transitive dep of @pyreon/zero-content (via the
// markdown pipeline's highlighter); the docs site never imports it
// directly, so a `import type` here would force a `shiki` devDep that
// fights the workspace's hoisting.
//
// Uses TextMate-style `settings` array (not Shiki's normalized
// `tokenColors`) — Shiki accepts both shapes through
// `ThemeRegistrationAny`.
type ThemeRegistrationRaw = {
  name: string
  type: 'dark' | 'light'
  colors?: Record<string, string>
  settings: Array<
    | { settings: { background?: string; foreground?: string; fontStyle?: string } }
    | {
        scope: string | string[]
        settings: { foreground?: string; background?: string; fontStyle?: string }
      }
  >
}

interface Palette {
  bg: string
  fg: string
  comment: string
  punct: string
  keyword: string
  string: string
  number: string
  fn: string
  type: string
  variable: string
}

// The site's ONE syntax theme (visual-alignment.md A9), from `site/theme.ts`:
// keyword ember, string warm, number plasma, fn cyan, type violet, comment and
// punctuation fog. The light set is the AA-checked one for code on the paper
// well (every token ≥ 4.5:1 on #F4EFE6 and #FFFFFF). Product pages
// (vite-plugins/product-content.ts) and the docs share these two themes.
const fromSyntax = (s: (typeof syntax)['dark' | 'light']): Palette => ({
  bg: s.bg,
  fg: s.fg,
  comment: s.com,
  punct: s.punct,
  keyword: s.kw,
  string: s.str,
  number: s.num,
  fn: s.fn,
  type: s.type,
  variable: s.fg,
})

const DARK: Palette = fromSyntax(syntax.dark)
const LIGHT: Palette = fromSyntax(syntax.light)

function makeTheme(p: Palette, type: 'dark' | 'light'): ThemeRegistrationRaw {
  return {
    name: `pyreon-${type}`,
    type,
    colors: {
      'editor.background': p.bg,
      'editor.foreground': p.fg,
    },
    settings: [
      { settings: { background: p.bg, foreground: p.fg } },
      {
        scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
        settings: { foreground: p.comment, fontStyle: 'italic' },
      },
      {
        scope: ['punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator'],
        settings: { foreground: p.punct },
      },
      {
        scope: [
          'keyword',
          'storage',
          'storage.type',
          'storage.modifier',
          'keyword.control',
          'keyword.operator.new',
          'keyword.operator.expression',
        ],
        settings: { foreground: p.keyword },
      },
      {
        scope: ['string', 'string.template', 'punctuation.definition.string'],
        settings: { foreground: p.string },
      },
      {
        scope: ['constant.numeric', 'constant.language', 'constant.character', 'keyword.other.unit'],
        settings: { foreground: p.number },
      },
      {
        scope: [
          'entity.name.function',
          'support.function',
          'meta.function-call entity.name.function',
          'variable.function',
        ],
        settings: { foreground: p.fn },
      },
      {
        scope: [
          'entity.name.type',
          'entity.name.class',
          'support.type',
          'support.class',
          'entity.other.inherited-class',
          'entity.name.namespace',
        ],
        settings: { foreground: p.type },
      },
      {
        scope: [
          'variable',
          'variable.other',
          'variable.parameter',
          'meta.definition.variable entity.name',
          'support.variable',
        ],
        settings: { foreground: p.variable },
      },
      {
        scope: ['entity.name.tag', 'meta.tag'],
        settings: { foreground: p.keyword },
      },
      {
        scope: ['entity.other.attribute-name'],
        settings: { foreground: p.fn },
      },
    ],
  }
}

export const pyreonSyntaxDark = makeTheme(DARK, 'dark')
export const pyreonSyntaxLight = makeTheme(LIGHT, 'light')
