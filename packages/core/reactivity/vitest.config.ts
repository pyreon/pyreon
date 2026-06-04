import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // Statements 98 / lines 99 / branches 95 after `branch-coverage-95-floor.test.ts`
  // covered:
  //  - Signal idempotent dispose (line 228 else-if falsy arm)
  //  - Computed idempotent dispose for both computedLazy + computedWithEquals
  //    paths (lines 202, 342)
  //  - NODE_ENV='production' false arms in computedWithEquals via vi.stubEnv +
  //    options.equals dispatch (lines 268, 292, 358)
  //  - renderEffect disposed-during-batch hits early-return (line 453 truthy arm)
  //
  // Remaining uncov is structurally unreachable / environment-only (signal.ts:254
  // notifyDirect non-batching arm, lpih.ts:62 typeof process undefined, etc.).
  coverageThresholds: { statements: 98, lines: 99, branches: 95 },
})
