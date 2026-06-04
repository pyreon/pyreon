import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'zero',
  environment: 'happy-dom',
  // PR 4 lifted statement coverage above the floor; branches still
  // sit at ~92% (lifecycle error paths + overload alternatives).
  // BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts documents
  // the rationale + roadmap.
  coverageThresholds: {
    statements: 95,
    branches: 92,
    functions: 95,
    lines: 95,
  },
})
