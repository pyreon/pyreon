import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  // 100 across the board (measured 100/100/100/100). The last gap was
  // `previewAnnotations`, computed at module scope from `import.meta.url` —
  // a top-level expression no test could reach either arm of. Extracting
  // the file:/http: decision into `previewPathFor(url)` made it testable
  // without changing what the preset emits. `lines` is deliberately left to
  // the category default rather than pinned at 100: a partial override
  // reads as "the thresholds are set" when one metric is still inherited.
  coverageThresholds: {
    statements: 100,
    branches: 100,
    functions: 100,
  },
})
