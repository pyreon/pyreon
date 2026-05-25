import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  environment: 'happy-dom',
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
