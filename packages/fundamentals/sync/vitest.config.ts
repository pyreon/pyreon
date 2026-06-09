import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // manifest.ts is gen-docs data (no runtime logic), index.ts is re-exports.
  coverageExclude: ['src/manifest.ts'],
})
