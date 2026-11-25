// Bounded `\s{1,10}` instead of unbounded `\s+` to remove worst-case
// backtracking; real import specifiers have 1-2 spaces around `as`.
export const AS_SPLIT_RE = /\s{1,10}as\s{1,10}/

/**
 * The local names a module binds to the plain markers, as regex alternations
 * (`state|s`, `derived|d`). The canonical names are always included — the
 * pre-pass accepts them when there is no import (the `'use plain'` form).
 * Tests reach it through `@pyreon/vite-plugin/internal`.
 *
 * @internal
 */
export function plainMarkerLocalNames(code: string): { state: string; derived: string } {
  const state = new Set(['state'])
  const derived = new Set(['derived'])
  const IMPORT_RE = /import\s{0,10}\{([^}]*)\}\s{0,10}from\s{0,10}['"]@pyreon\/core\/plain['"]/g
  let m: RegExpExecArray | null
  while ((m = IMPORT_RE.exec(code)) !== null) {
    for (const spec of m[1]!.split(',')) {
      const parts = spec.trim().split(AS_SPLIT_RE)
      const imported = parts[0]?.trim()
      const local = (parts[1] ?? parts[0])?.trim()
      if (!imported || !local || !/^\w+$/.test(local)) continue
      if (imported === 'state') state.add(local)
      else if (imported === 'derived') derived.add(local)
    }
  }

  return { state: [...state].join('|'), derived: [...derived].join('|') }
}
