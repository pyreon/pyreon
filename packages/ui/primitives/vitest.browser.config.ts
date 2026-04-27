import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '../../../vitest.browser'

// Per-package override: ui-primitives source is `.tsx` with the
// `@pyreon/core` JSX runtime. Vite's default JSX transform doesn't
// route to that runtime — without this override the browser test fails
// to parse `<div>{...}</div>` syntax in the imported sources.
export default defineBrowserConfig(playwright(), {
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@pyreon/core',
    },
  },
})
