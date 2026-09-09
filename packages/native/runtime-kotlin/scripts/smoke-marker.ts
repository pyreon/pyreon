/**
 * What a Kotlin co-source verification RUN actually did — and how to say so.
 *
 * `verify-kotlin` builds a JAR and runs its smoke `main()` through `java`. With
 * no JDK on PATH it degrades to compile-only, warns, and exits 0. The caller
 * (`check-native-cosource`) spawns it and DISCARDS a successful child's stdout,
 * so that warning was invisible — and the caller then reported
 * "(compiled + ran test)" purely because a `*Test.kt` FILE existed. Every
 * Kotlin behaviour assertion in the repo was therefore typecheck-only on any
 * machine without a JDK, while the log claimed otherwise. (The @pyreon/flow
 * port shipped a real selectAll/deleteSelected divergence exactly this way.)
 *
 * These three live in their own module because both halves need them and
 * `verify-kotlin.ts` is a SCRIPT — importing from there would execute a whole
 * verification run as a side effect of reading a string.
 */

/** Printed on stdout when the JAR was built but its `main()` could not be RUN. */
export const SMOKE_SKIPPED_MARKER = '[verify-kotlin] ⚠ SKIPPED smoke-run'

/**
 * Did the child actually EXECUTE the behaviour test, or only compile it?
 *
 * Read from the child's own output — never inferred from the file layout, which
 * is exactly the inference that made the gate lie.
 */
export function smokeSkipped(stdout: string): boolean {
  return stdout.includes(SMOKE_SKIPPED_MARKER)
}

/**
 * The suffix a co-source line reports, derived from what HAPPENED.
 *
 * Three distinct outcomes, and the middle one had no way to be expressed
 * before: no test to run, a test that ran, and a test that was compiled but
 * never executed.
 */
export function kotlinOutcomeLabel(outcome: { hasTest: boolean; smokeSkipped: boolean }): string {
  if (!outcome.hasTest) return ' (typecheck-only)'
  return outcome.smokeSkipped ? ' (compiled — smoke SKIPPED, no JDK)' : ' (compiled + ran test)'
}
