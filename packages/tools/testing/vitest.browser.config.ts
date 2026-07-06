import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// @pyreon/testing sources + tests are `.tsx` using the @pyreon/core JSX
// runtime — route the browser transform to it (same override as
// ui-primitives).
export default defineBrowserConfig(playwright(), {
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@pyreon/core',
    },
  },
})
