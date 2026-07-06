import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  environment: 'happy-dom',
  excludeBrowserTests: true,
  overrides: {
    // @ts-expect-error vitest UserConfig doesn't expose oxc plugin opts
    oxc: {
      jsx: {
        runtime: 'automatic',
        importSource: '@pyreon/core',
      },
    },
  },
})
