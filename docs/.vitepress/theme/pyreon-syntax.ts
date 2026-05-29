/**
 * `pyreon` syntax themes — TS/JSX, dark + light.
 *
 * Hex values mirror the `--syn-*` semantic tokens in ./tokens.css
 * (verbatim from the brand handoff §3 / §6.7). The light palette is the
 * AA-verified set from the handoff. Shiki resolves colours at build time
 * so it cannot read CSS vars — VitePress applies the correct one per
 * `.dark` class via the `{ light, dark }` config. Keep these two
 * palettes in lockstep with tokens.css if the handoff revises them.
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

// tokens.css → semantic `--syn-*` · DARK
const DARK: Palette = {
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

// tokens.css → semantic `--syn-*` · LIGHT (AA-verified on paper-3)
const LIGHT: Palette = {
  bg: '#FAF5EB',
  fg: '#14141C',
  comment: '#71707C',
  punct: '#6E6A78',
  keyword: '#B43A0E',
  string: '#855507',
  number: '#A41859',
  fn: '#0A6E89',
  type: '#5226C7',
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
        scope: [
          'constant.numeric',
          'constant.language',
          'constant.character',
          'keyword.other.unit',
        ],
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
