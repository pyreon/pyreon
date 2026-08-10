/**
 * Resolve "which component did you mean?" for a scoped verify.
 *
 * ── Why a typo must never look like a pass ────────────────────────────────
 *
 * `atlas verify Buton` filtering the catalog to nothing and reporting
 * `0 scenarios, 0 failing` is the worst possible answer: it is green, it is
 * fast, and it is about nothing. An agent looping on that signal would report
 * its component fixed without ever having checked it.
 *
 * So an unmatched lookup is an ERROR that names the near misses, an ambiguous
 * one refuses and names the candidates (the same rule `resolveComponent`
 * already applies everywhere else), and a case-only difference resolves and
 * SAYS it did rather than silently accepting either spelling.
 *
 * Pure — no fs, no mounting — so every rule here is testable against literals.
 */
import { componentKey, resolveComponent } from '../core/identity'
import type { ComponentIntelligence } from '../core/types'

/** What a lookup resolved to. */
export type FocusOutcome =
  | { kind: 'matched'; components: readonly ComponentIntelligence[]; note?: string }
  | { kind: 'ambiguous'; message: string }
  | { kind: 'unknown'; message: string }

/** Levenshtein distance, capped — used only to rank suggestions. */
function distance(a: string, b: string): number {
  // Row-at-a-time: the full matrix is pointless when only the last row is read,
  // and this runs once per candidate on catalogs with thousands of components.
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]!
}

/**
 * Names worth suggesting for a lookup that matched nothing.
 *
 * Ranked by edit distance, and CUT at a third of the lookup's length: past
 * that the "suggestion" is an unrelated component, and a confident wrong
 * suggestion costs more than none. Substring matches are always kept —
 * `Btn` → `ButtonGroup` is a real intent that distance alone scores badly.
 */
export function suggestNames(names: readonly string[], lookup: string, limit = 3): string[] {
  const needle = lookup.toLowerCase()
  const budget = Math.max(2, Math.ceil(lookup.length / 3))
  return [...new Set(names)]
    .map((name) => {
      const lower = name.toLowerCase()
      if (lower.includes(needle)) return { name, score: 0 }
      // Edit distance is at least the LENGTH difference, so a candidate whose
      // length already puts it past the budget cannot qualify and never needs
      // the O(n·m) walk. Sound, not a heuristic — and it is what keeps this
      // path cheap when the "lookup" is something enormous pasted into argv:
      // measured 1622ms → 3ms for a 20k-character lookup against 1419 names.
      if (Math.abs(lower.length - needle.length) > budget) {
        return { name, score: Number.POSITIVE_INFINITY }
      }
      return { name, score: distance(needle, lower) }
    })
    .filter((c) => c.score <= budget)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((c) => c.name)
}

/**
 * Narrow a discovered set to one component.
 *
 * Delegates the key-vs-name decision to `resolveComponent` so the CLI, the MCP
 * tools and the dev-server RPC cannot drift on what `Button` means. Only the
 * case-insensitive retry and the suggestion text are added here, and the retry
 * applies the same unambiguity rule rather than taking the first hit.
 */
export function focusComponents(
  discovered: readonly ComponentIntelligence[],
  lookup: string,
): FocusOutcome {
  const resolved = resolveComponent(discovered, lookup)
  if (resolved.found) return { kind: 'matched', components: [resolved.found] }
  if (resolved.ambiguous.length > 0) {
    return {
      kind: 'ambiguous',
      message:
        `"${lookup}" matches ${resolved.ambiguous.length} components across projects ` +
        `(${resolved.ambiguous.join(', ')}). Ask for one of those keys.`,
    }
  }

  // Case-only difference — `atlas verify button` for a `Button`. Accepted
  // rather than rejected (nobody means a different component by it) but
  // ANNOUNCED, so the id in the output is not a surprise. Ambiguity is still
  // refused: two components differing only in case are a real collision.
  const lower = lookup.toLowerCase()
  const insensitive = discovered.filter(
    (c) => c.name.toLowerCase() === lower || componentKey(c).toLowerCase() === lower,
  )
  if (insensitive.length === 1) {
    const found = insensitive[0]!
    return {
      kind: 'matched',
      components: [found],
      note: `matched "${componentKey(found)}" (case-insensitive)`,
    }
  }
  if (insensitive.length > 1) {
    return {
      kind: 'ambiguous',
      message:
        `"${lookup}" matches ${insensitive.length} components ignoring case ` +
        `(${insensitive.map(componentKey).join(', ')}). Ask for one of those keys.`,
    }
  }

  const near = suggestNames(
    discovered.map((c) => c.name),
    lookup,
  )
  return {
    kind: 'unknown',
    message:
      `no component named "${lookup}" in this catalog` +
      (near.length > 0 ? ` — did you mean ${near.join(', ')}?` : '') +
      (discovered.length === 0 ? ' (the scan found no components at all)' : ''),
  }
}
