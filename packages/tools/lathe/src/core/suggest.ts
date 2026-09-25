/**
 * "Did you mean" -- the nearest known name to a mistyped one.
 *
 * Shared by the CLI (flags, commands, enumerated values) and the Vite plugin
 * (a misspelled spec file), so a typo gets the same help wherever it lands.
 */

/** The candidate within edit distance 2 (or a prefix match), if any. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    const d = c.startsWith(input) && input.length >= 3 ? 1 : distance(input, c)
    if (d < bestScore) {
      bestScore = d
      best = c
    }
  }
  return bestScore <= Math.max(2, Math.floor(input.length / 4)) ? best : undefined
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] as number
      row[j] = Math.min((row[j] as number) + 1, (row[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length] as number
}
