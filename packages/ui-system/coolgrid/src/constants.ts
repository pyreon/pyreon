export const PKG_NAME = '@pyreon/coolgrid'

// Dev-mode gate. `import.meta.env.DEV` is literal-replaced by Vite at build
// time and tree-shakes to zero bytes in prod. The previous
// `process.env.NODE_ENV !== 'production'` form was dead code in real Vite
// browser bundles (Vite does not polyfill `process`).
export const __DEV__ = process.env.NODE_ENV !== 'production'

/**
 * Grid configuration keys that are passed through context
 * from Container to Row and from Row to Col components.
 */
export const CONTEXT_KEYS = [
  // 'breakpoints',
  // 'rootSize',
  'columns',
  'size',
  'gap',
  'padding',
  'gutter',
  'colCss',
  'colComponent',
  'rowCss',
  'rowComponent',
  'contentAlignX',
]
