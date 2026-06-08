// ─── Levenshtein edit distance — shared "did you mean…?" helper ────────────
//
// Two consumers historically shipped near-identical implementations:
//
//   - `mdx-scan/validate.ts:editDistance` (case-insensitive, used for
//     PascalCase-component-name typos in `.md` files)
//   - `pipeline/remark-plugins/callout.ts:calloutEditDistance` (case-
//     sensitive, used for `:::warn` → `:::warning` typos in markdown blocks)
//
// Both did the same DP. Drift risk: a future fix to one (e.g. cost
// tuning, transposition handling) would silently miss the other. This
// module is the single source.
//
// Case handling is a parameter (the historical default for the
// validator was case-insensitive; for callouts it was case-sensitive).
// Naive O(n*m) — adequate for the small alphabets these callers
// produce.

/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * @param a — first string
 * @param b — second string
 * @param opts.caseInsensitive — when true, both strings are lowercased
 *   before comparison. Defaults to false (case-sensitive).
 * @returns the minimum number of single-character insertions,
 *   deletions, or substitutions required to transform `a` into `b`
 */
export function levenshtein(
  a: string,
  b: string,
  opts?: { caseInsensitive?: boolean },
): number {
  if (a === b) return 0
  const aIn = opts?.caseInsensitive === true ? a.toLowerCase() : a
  const bIn = opts?.caseInsensitive === true ? b.toLowerCase() : b
  if (aIn === bIn) return 0
  if (aIn.length === 0) return bIn.length
  if (bIn.length === 0) return aIn.length
  // Two-row DP — memory O(min(len)).
  const m = aIn.length
  const n = bIn.length
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = aIn.charCodeAt(i - 1) === bIn.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insert
        prev[j]! + 1, // delete
        prev[j - 1]! + cost, // substitute
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]!
  }
  return prev[n]!
}
