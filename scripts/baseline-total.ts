/**
 * A committed baseline that records a `total` beside its entries must agree
 * with itself: the total is the sum of the entries.
 *
 * The total is DERIVED, so git can produce a file no generator ever wrote. Two
 * branches change different entry lines; one of them also rewrites the total
 * line; the merge is textually clean (or the one conflict, on the total line,
 * is settled by hand) and the result records 3403 beside entries that sum to
 * 3405. Nothing that compares CURRENT findings with the entries notices,
 * because the entries are right. That reached the default branch on 2026-11-17
 * (`readable-oxlint-baseline.json`) and failed a well-formedness unit test
 * there, in a shard the pull request had not run.
 *
 * So each ratchet script checks its own baseline before it compares anything:
 * the scripts run in `validate-fast` and in `Fast Gates` on every pull
 * request, where a hand-merged baseline now fails with the command that
 * regenerates it.
 */

/** Why `total` and `counts` disagree, or are not counts at all. Empty when the baseline is consistent. */
export function recordedTotalProblems(total: unknown, counts: Readonly<Record<string, unknown>> | unknown): string[] {
  const problems: string[] = []
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
    problems.push(`its \`total\` is ${JSON.stringify(total)}, not a count`)
  }
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts)) {
    problems.push('its entries are not an object of counts')

    return problems
  }
  let sum = 0
  for (const [key, n] of Object.entries(counts)) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      problems.push(`entry ${JSON.stringify(key)} is ${JSON.stringify(n)}, not a positive count`)
      continue
    }
    sum += n
  }
  if (typeof total === 'number' && problems.length === 0 && sum !== total) {
    problems.push(`its \`total\` is ${total} but its entries sum to ${sum}`)
  }

  return problems
}

/** The message a gate prints for an inconsistent baseline, or null when it is consistent. */
export function baselineTotalError(
  path: string,
  total: unknown,
  counts: unknown,
  updateCommand: string,
): string | null {
  const problems = recordedTotalProblems(total, counts)
  if (problems.length === 0) return null

  return [
    `✗ ${path} is not a file its generator wrote:`,
    ...problems.slice(0, 10).map((p) => `    ${p}`),
    ...(problems.length > 10 ? [`    …and ${problems.length - 10} more`] : []),
    `It is generated. Never merge or edit it by hand: after merging the default branch, regenerate it with \`${updateCommand}\`.`,
  ].join('\n')
}

/** Parse a committed baseline, or throw with the path: a file with conflict markers must not read as "no baseline". */
export function parseBaseline<T>(path: string, text: string, updateCommand: string): T {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error(
      `✗ ${path} is not valid JSON (${(error as Error).message}). It is generated: regenerate it with \`${updateCommand}\`.`,
    )
  }
}
