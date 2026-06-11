/**
 * Canonical "is this path test code?" classifier — the SINGLE source of
 * truth for the source-change CI gates.
 *
 * ## Why this exists
 *
 * Two gates need to decide whether a changed file is *test code* (which
 * must NOT be treated as a real source change):
 *
 * - `check-diagnose-catalog.ts` — a new regression test for an existing
 *   bug doesn't need an `ERROR_PATTERNS` catalog entry.
 * - `check-changeset-required.ts` — a test-only PR in a published package
 *   doesn't ship to consumers (`scripts/publish.ts` strips `src/` from the
 *   tarball entirely, so test files never reach npm), so it needs no
 *   changeset.
 *
 * Both encode the IDENTICAL notion of "test path." They previously each
 * carried a byte-for-byte copy of these two regexes, with a comment in
 * `check-diagnose-catalog.ts` admitting the hazard ("Update both this list
 * AND the unit tests if a new test directory convention enters the
 * codebase"). Two copies = guaranteed drift the day a third test
 * convention lands. This module collapses them to one definition.
 *
 * ## Scope discipline — what this is NOT
 *
 * This is the classifier for SOURCE-CHANGE GATES specifically. Several
 * OTHER tools classify "test-ish" paths with deliberately different
 * shapes, and must NOT be folded in here (coupling them would be a
 * wrong-abstraction smell — they vary independently for real reasons):
 *
 * - `vitest-config` includes/excludes (`*.browser.test.{ts,tsx}`) — the
 *   RUNNER's per-config run-selection, narrower than "is test code."
 * - `check-browser-smoke.ts` (`*.browser.test.*`) — the browser SUBSET.
 * - `bootstrap.ts` (`.test.{ts,tsx,js}`) — an mtime-staleness walk that
 *   also covers built `.js` output.
 * - `audit-leak-classes.ts` (adds `.test.helpers.ts`) — test-SUPPORT
 *   files, a superset for a different audit.
 * - `audit-codebase.ts` — test-LOC accounting.
 *
 * If a NEW test-directory / test-suffix convention enters the codebase,
 * update the two regexes HERE (and `test-paths.test.ts`) — one place.
 */

/** Matches a test/spec/story FILE by suffix: `*.test.ts(x)` / `*.spec.ts(x)` / `*.stories.ts(x)`. */
export const TEST_FILE_RE = /\.(test|spec|stories)\.tsx?$/

/** Matches anything inside a test/story DIRECTORY at any depth: `…/tests/…`, `…/__tests__/…`, `…/test/…`, `…/__test__/…`, `…/stories/…`. */
export const TEST_DIR_RE = /\/(tests|__tests__|test|__test__|stories)\//

/**
 * Whether a repo-relative path is test code (a test/spec/story file, OR
 * anything under a test/story directory). The encapsulated form both
 * gates call — checking ONE predicate instead of two regexes removes the
 * chance a caller wires up only one half.
 */
export function isTestPath(file: string): boolean {
  return TEST_FILE_RE.test(file) || TEST_DIR_RE.test(file)
}
