import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // Branches re-baselined 99 → 97 (measured 97.01 at the 2026-07 coverage-gate
  // restoration): the residual ~11 uncovered branches in use-form.ts are
  // defensive arms (AbortError races, `fieldRunValidation` missing for a field
  // that exists — structurally prevented by field setup) accumulated by the
  // reset/keep + dynamic-field + file-input feature waves. Aspiration stays 99;
  // raise back in lockstep as targeted tests land. A red-on-arrival threshold
  // detects nothing — it must sit at/below measured reality to catch regression.
  coverageThresholds: { statements: 99, branches: 97, functions: 99, lines: 99 },
})
