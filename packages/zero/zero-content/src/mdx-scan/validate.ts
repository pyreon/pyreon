// ─── Component-reference validation ──────────────────────────────────────
//
// Given the set of component names referenced in a markdown file, the
// set of names available (built-ins + `src/mdx/` scan + per-file
// hoisted ESM imports), surface any unknown references as a build
// error with a "did you mean X?" suggestion via Levenshtein distance.

export interface ValidationIssue {
  /** The unknown component name as it appears in the markdown. */
  name: string
  /** Closest known name within an editing distance of 3, if any. */
  suggestion: string | null
  /** All known candidates within editing distance 3, sorted. */
  candidates: string[]
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

/**
 * Built-in component names always available in markdown. The pipeline
 * emits an auto-import for them through the same `componentsModule` —
 * the virtual module re-exports built-ins so users don't need to write
 * the import manually.
 *
 * Imported from `_shared/built-ins` — single source of truth shared with
 * `mdx-scan/scanner.ts:renderVirtualModule` so the validator and the
 * virtual-module emitter can never drift on contents OR order. Re-
 * exported with the historical name + shape so existing tests + the
 * validator's downstream `did-you-mean` suggestions don't need to know
 * about the move.
 */
import { BUILT_IN_COMPONENTS as _BUILT_INS } from '../_shared/built-ins'
export const BUILT_IN_COMPONENTS: readonly string[] = _BUILT_INS

export interface ValidationContext {
  /** Component names available from the `src/mdx/` scan. */
  scannedNames: string[]
  /** Names pulled in by the markdown file's own hoisted ESM imports. */
  hoistedNames: string[]
  /** Component names referenced in the markdown body. */
  referencedNames: string[]
  /**
   * Additional names always available (e.g. consumer-side overrides
   * passed to the plugin). Defaults to an empty set.
   */
  extraBuiltIns?: string[]
}

/**
 * Validate that every referenced component is resolvable. Returns
 * `issues` for each unknown name with the closest match as a hint.
 */
export function validateComponentRefs(
  ctx: ValidationContext,
): ValidationResult {
  const known = new Set<string>([
    ...BUILT_IN_COMPONENTS,
    ...(ctx.extraBuiltIns ?? []),
    ...ctx.scannedNames,
    ...ctx.hoistedNames,
  ])
  const knownList = Array.from(known).sort()
  const issues: ValidationIssue[] = []
  for (const ref of ctx.referencedNames) {
    if (known.has(ref)) continue
    const ranked = knownList
      .map((candidate) => ({
        candidate,
        distance: editDistance(ref, candidate),
      }))
      .filter((entry) => entry.distance <= 3)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.candidate.localeCompare(b.candidate)
      })
    issues.push({
      name: ref,
      suggestion: ranked[0]?.candidate ?? null,
      candidates: ranked.map((r) => r.candidate),
    })
  }
  return { ok: issues.length === 0, issues }
}

/**
 * Format a validation result as a single multi-line error message. Used
 * by the Vite plugin's transform hook to surface failures via
 * `this.error()`.
 */
export function formatValidationError(
  result: ValidationResult,
  fileLabel: string,
): string {
  if (result.ok) return ''
  const lines = result.issues.map((issue) => {
    if (issue.suggestion) {
      return `  - Unknown component <${issue.name} />. Did you mean <${issue.suggestion} />?`
    }
    return `  - Unknown component <${issue.name} />. No close match found in built-ins or src/mdx/.`
  })
  return `[@pyreon/zero-content] ${fileLabel}: ${result.issues.length} unknown component reference(s).
${lines.join('\n')}

Available components include: ${BUILT_IN_COMPONENTS.join(', ')}, plus any PascalCase exports from src/mdx/**/*.{ts,tsx,js,jsx}.`
}

/**
 * Levenshtein edit distance (insertions, deletions, substitutions).
 * Naive O(n*m) — fast enough for the small alphabets we feed it.
 *
 * @internal exported for testing
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const aLow = a.toLowerCase()
  const bLow = b.toLowerCase()
  // Two-row DP to keep memory O(min(len)).
  const m = aLow.length
  const n = bLow.length
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = aLow.charCodeAt(i - 1) === bLow.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insert
        prev[j]! + 1, // delete
        prev[j - 1]! + cost, // substitute
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]!
}

/**
 * Extract identifiers brought into scope by ESM `import` statements.
 * Used to feed the validator's `hoistedNames` list so per-`.md`
 * `import` statements suppress the "unknown component" warning.
 *
 * The matcher recognises:
 *   - `import Name from '...'`
 *   - `import { A, B, C as D } from '...'`
 *   - `import { A as X } from '...'`
 *   - `import * as Ns from '...'`
 *   - `import Default, { A, B } from '...'`
 *
 * Case-insensitive on the import keyword; the binding name is taken
 * verbatim.
 *
 * @internal exported for testing
 */
export function extractImportBindings(esm: string): string[] {
  const bindings = new Set<string>()
  // `import D, { A, B as C } from '...'` — split into default + named.
  const re = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:from)?/g
  for (const m of esm.matchAll(re)) {
    const defaultBinding = m[1]
    const namedBlock = m[2]
    if (defaultBinding) bindings.add(defaultBinding)
    if (namedBlock) {
      for (const piece of namedBlock.split(',')) {
        const trimmed = piece.trim()
        if (!trimmed) continue
        const asMatch = trimmed.match(/^[A-Za-z0-9_$]+\s+as\s+([A-Za-z0-9_$]+)$/)
        if (asMatch) {
          bindings.add(asMatch[1]!)
          continue
        }
        const bare = trimmed.match(/^([A-Za-z0-9_$]+)$/)
        if (bare) bindings.add(bare[1]!)
      }
    }
  }
  // `import * as Ns from '...'` — separate pattern.
  for (const m of esm.matchAll(/import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from/g)) {
    bindings.add(m[1]!)
  }
  return Array.from(bindings)
}
