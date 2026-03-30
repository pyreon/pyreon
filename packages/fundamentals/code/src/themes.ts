import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
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
    color: '#94a3b8',
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
    color: '#94a3b8',
  },
})

/**
 * Dark theme — VS Code inspired.
 */
export const darkTheme: Extension = EditorView.theme(
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
      color: '#585b70',
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
      color: '#585b70',
    },
    '.cm-matchingBracket': {
      backgroundColor: '#45475a',
      color: '#f5e0dc',
    },
  },
  { dark: true },
)

/**
 * Resolve a theme value to a CodeMirror extension.
 */
export function resolveTheme(theme: EditorTheme): Extension {
  if (theme === 'light') return lightTheme
  if (theme === 'dark') return darkTheme
  return theme // custom Extension
}
