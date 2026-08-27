import { defineNodeConfig } from '@pyreon/vitest-config'

// `--expose-gc`: `identifier-index-gc.test.ts` asserts that a node collected out
// from under the index's `WeakRef` is reported missing AND pruned. That branch
// has no deterministic trigger — only a real collection reaches it — and without
// it the index accumulates one dead entry per collected node.
export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  overrides: { test: { execArgv: ['--expose-gc'] } },
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
})
