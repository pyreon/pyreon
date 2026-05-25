import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// JSX in `*.browser.test.tsx` uses the `@pyreon/core` runtime — vite's default
// JSX transform doesn't route there, so without this override the test file
// fails to parse with "make sure to not set jsx to preserve". Mirrors the
// pattern in `packages/ui/components/vitest.browser.config.ts`.
export default defineBrowserConfig(playwright(), {
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@pyreon/core',
    },
  },
})
