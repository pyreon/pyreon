import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { EditorTheme } from './types'

/**
 * Light theme — clean, minimal.
 */
export const lightTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1e293b',
  },
  '.cm-content': {
    caretColor: '#1e293b',
  },
  '.cm-cursor': {
    borderLeftColor: '#1e293b',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#dbeafe',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    color: '#64748b',
    borderRight: '1px solid #e2e8f0',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },
  '.cm-activeLine': {
    backgroundColor: '#f8fafc',
  },
  '.cm-foldGutter': {
    color: '#64748b',
  },
})

/**
 * Token colours for the dark theme (Catppuccin Mocha, the palette the chrome
 * above already uses).
 *
 * The editor installs CodeMirror's `defaultHighlightStyle` as a FALLBACK
 * highlighter, and that style is written for a WHITE background — keywords
 * `#708`, strings `#a11`, definitions `#00f`. With only the chrome themed dark,
 * every keyword and string in a dark editor rendered at roughly 2:1 contrast
 * against `#1e1e2e`: present, and unreadable. A non-fallback highlighter here
 * takes precedence over the fallback, so the dark theme now carries its own.
 */
const darkHighlightStyle = HighlightStyle.define(
  [
    {
      tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword],
      color: '#cba6f7',
    },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#a6e3a1' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#fab387' },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: '#9399b2',
      fontStyle: 'italic',
    },
    { tag: [tags.typeName, tags.className, tags.namespace], color: '#f9e2af' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#89b4fa' },
    {
      tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)],
      color: '#89dceb',
    },
    { tag: [tags.propertyName, tags.attributeName], color: '#89b4fa' },
    { tag: [tags.tagName, tags.angleBracket], color: '#f38ba8' },
    { tag: [tags.variableName, tags.self], color: '#cdd6f4' },
    { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: '#bac2de' },
    { tag: tags.invalid, color: '#f38ba8' },
    { tag: tags.link, color: '#89b4fa', textDecoration: 'underline' },
    { tag: tags.heading, color: '#f38ba8', fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: 'bold' },
  ],
  { themeType: 'dark' },
)

/**
 * Dark theme — VS Code inspired chrome with its own token colours (see
 * `darkHighlightStyle`).
 */
export const darkTheme: Extension = [
  EditorView.theme(
    {
      '&': {
        backgroundColor: '#1e1e2e',
        color: '#cdd6f4',
      },
      '.cm-content': {
        caretColor: '#f5e0dc',
      },
      '.cm-cursor': {
        borderLeftColor: '#f5e0dc',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: '#45475a',
      },
      '.cm-gutters': {
        backgroundColor: '#181825',
        color: '#7f849c',
        borderRight: '1px solid #313244',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#1e1e2e',
        color: '#a6adc8',
      },
      '.cm-activeLine': {
        backgroundColor: '#1e1e2e80',
      },
      '.cm-foldGutter': {
        color: '#7f849c',
      },
      '.cm-matchingBracket': {
        backgroundColor: '#45475a',
        color: '#f5e0dc',
      },
    },
    { dark: true },
  ),
  syntaxHighlighting(darkHighlightStyle),
]

/**
 * Resolve a theme value to a CodeMirror extension.
 */
export function resolveTheme(theme: EditorTheme): Extension {
  if (theme === 'light') return lightTheme
  if (theme === 'dark') return darkTheme
  return theme // custom Extension
}
