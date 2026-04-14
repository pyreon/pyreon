/**
 * Universal file-path classifiers for lint rules.
 *
 * What belongs here:
 *   - Conventions that exist in every project the linter runs on
 *     (test files, example directories — the `*.test.*` convention
 *     is not Pyreon-specific).
 *
 * What does NOT belong here:
 *   - Monorepo-specific paths like `packages/core/runtime-dom/` —
 *     those are implementation knowledge of one particular codebase
 *     and have no meaning in a user's app. Exemptions for such paths
 *     belong in the consuming project's lint config via the
 *     `exemptPaths: string[]` rule option — see `utils/exempt-paths.ts`
 *     and the Pyreon monorepo's `.pyreonlintrc.json` at repo root for
 *     reference.
 */

/**
 * Matches files that are tests by convention. Universal — the
 * `*.test.*` / `*.spec.*` / `/tests/` / `/__tests__/` conventions
 * exist in every codebase this linter runs on, not just Pyreon.
 */
export function isTestFile(filePath: string): boolean {
  return (
    filePath.includes('/tests/') ||
    filePath.includes('/test/') ||
    filePath.includes('/__tests__/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  )
}
