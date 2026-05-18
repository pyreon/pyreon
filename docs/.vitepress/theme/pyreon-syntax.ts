/**
 * `pyreon` syntax theme — TS/JSX, dark + light.
 *
 * Hex values are taken verbatim from the brand handoff §6.7 ("Syntax
 * theme") — both the dark column and the inline light column. This is
 * the single source for code-block colors; do not hand-edit the values,
 * they must stay in lockstep with the design tokens. The scope→role
 * mapping is shared by both schemes via `makeTheme()`, so dark and
 * light can never structurally drift.
 *
 * A published VS Code extension (`pyreon-syntax`) is a documented
 * follow-up in the handoff.
 */
import type { ThemeRegistrationRaw } from 'shiki'

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

// Handoff §6.7 — dark column
const dark: Palette = {
  bg: '#0A0A0E',
  fg: '#E6E0D2',
  comment: '#5C5867',
  punct: '#8A8696',
  keyword: '#FF5E1A', // ember-core
  string: '#FFC83D', // ember-warm
  number: '#FF1F8C', // ember-plasma
  fn: '#22D3EE', // cyan
  type: '#A78BFA', // soft violet
  variable: '#F4EFE6',
}

// Handoff §6.7 — light column (the "— #… on light" values)
const light: Palette = {
  bg: '#F4EFE6',
  fg: '#14141C',
  comment: '#8E8A9A',
  punct: '#6B6776',
  keyword: '#C2410C',
  string: '#A16207',
  number: '#BE185D',
  fn: '#0E7490',
  type: '#6D28D9',
  variable: '#14141C',
}

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

export const pyreonSyntaxDark = makeTheme(dark, 'dark')
export const pyreonSyntaxLight = makeTheme(light, 'light')
