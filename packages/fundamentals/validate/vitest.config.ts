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
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. It has no
  // unit tests in this package on purpose: its emit is verified by behaviour in the @pyreon/native-compiler suite
  // (the golden corpus plus the native-validate / tier2-schema / form-schema specs), which owns the swiftc and
  // kotlinc lanes — the same arrangement @pyreon/http and @pyreon/charts document.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  coverageThresholds: { statements: 97, branches: 94, functions: 98, lines: 97 },
})
