/**
 * `pyreon` syntax theme — TS/JSX, dark.
 *
 * Hex values are taken verbatim from the brand handoff §6.7 ("Syntax
 * theme"). This is the single source for code-block colors; do not
 * hand-edit the values here — they must stay in lockstep with the
 * design tokens. A light variant + a published VS Code extension
 * (`pyreon-syntax`) are documented follow-ups in the handoff.
 */
import type { ThemeRegistrationRaw } from 'shiki'

// Handoff §6.7 — dark palette
const bg = '#0A0A0E'
const fg = '#E6E0D2'
const comment = '#5C5867'
const punct = '#8A8696'
const keyword = '#FF5E1A' // ember-core
const string = '#FFC83D' // ember-warm
const number = '#FF1F8C' // ember-plasma
const fn = '#22D3EE' // cyan
const type = '#A78BFA' // soft violet
const variable = '#F4EFE6'

export const pyreonSyntaxDark: ThemeRegistrationRaw = {
  name: 'pyreon',
  type: 'dark',
  colors: {
    'editor.background': bg,
    'editor.foreground': fg,
  },
  settings: [
    { settings: { background: bg, foreground: fg } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: comment, fontStyle: 'italic' },
    },
    {
      scope: ['punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator'],
      settings: { foreground: punct },
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
      settings: { foreground: keyword },
    },
    {
      scope: ['string', 'string.template', 'punctuation.definition.string'],
      settings: { foreground: string },
    },
    {
      scope: ['constant.numeric', 'constant.language', 'constant.character', 'keyword.other.unit'],
      settings: { foreground: number },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call entity.name.function',
        'variable.function',
      ],
      settings: { foreground: fn },
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
      settings: { foreground: type },
    },
    {
      scope: [
        'variable',
        'variable.other',
        'variable.parameter',
        'meta.definition.variable entity.name',
        'support.variable',
      ],
      settings: { foreground: variable },
    },
    {
      scope: ['entity.name.tag', 'meta.tag'],
      settings: { foreground: keyword },
    },
    {
      scope: ['entity.other.attribute-name'],
      settings: { foreground: fn },
    },
  ],
}
