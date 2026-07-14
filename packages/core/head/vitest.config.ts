import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  // Ratcheted 98 → 100 across the board: the link-key href/rel/index fallbacks
  // and toProps' undefined-strip (the last 2 uncovered branches) are now covered
  // by dedup-behavior tests. Pure-logic module (no platform-gated arms), so 100%
  // is stable cross-platform — a new uncovered line/branch must break the gate.
  coverageThresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
  excludeBrowserTests: true,
})
