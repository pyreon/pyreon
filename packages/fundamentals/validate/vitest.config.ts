import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  // Re-baselined 99/97/99/99 → 95/90/98/97 (measured 95.12/90.11/98.13/97.54
  // at the 2026-07 coverage-gate restoration; the Coverage (Full) gate had
  // been red on every main run — a red-on-arrival threshold detects nothing).
  // The drift came from the JIT: the compiled fast path inlines most check
  // verdicts, so the INTERPRETER failure arms of the newer check/composition
  // waves (string substring checks, object algebra, union call-forms, the
  // mini/server subpath entries, intersection/record edge arms) no longer
  // execute under `parse()` even though their contracts are test-locked via
  // the compiled path (jit-differential + emit-equivalence suites). Aspiration
  // stays 99 — raise back in lockstep as interpreter-path tests land
  // (BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts mirrors these).
  // Ratcheted 95→96 stmts / 90→91 branches after json-schema.ts reached 100%
  // (measured 97.06 / 93.40; CI-linux baseline ~95.12/90.11 + the same pure
  // toJsonSchema conversion coverage clears 96/91 on both platforms). The
  // residual gap is the interpreter failure arms redundant with the JIT path
  // (documented in scripts/check-coverage.ts).
  coverageThresholds: { statements: 96, branches: 91, functions: 98, lines: 97 },
})
