/** Did-you-mean suggestions for flags and config keys. */

/** The candidate within edit distance 2 of `input`, if one exists. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined
  let bestDistance = 3
  for (const candidate of candidates) {
    const d = editDistance(input, candidate)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return best
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] as number
      row[j] = Math.min(current + 1, (row[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = current
    }
  }
  return row[b.length] as number
}
