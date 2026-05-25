import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  excludeBrowserTests: true,
  overrides: {
    test: {
      globals: true,
      include: ['**/*.test.ts'],
    },
  },
})
