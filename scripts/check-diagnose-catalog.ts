/**
 * CI guard: PRs touching framework error-surface code paths (`runtime-dom/`,
 * `runtime-server/`, `core/`, `compiler/`, `router/`) must grow the
 * `ERROR_PATTERNS` catalog in `packages/core/compiler/src/react-intercept.ts`
 * — or carry a `skip-diagnose-catalog` label.
 *
 * ## Why
 *
 * `pyreon doctor diagnose` + the MCP `diagnose` tool both pattern-match user-
 * facing error strings to surface fix suggestions. Every bug fix in a
 * framework subsystem that COULD have surfaced as a user-visible error is
 * an opportunity to teach the catalog. Without a CI gate, the catalog
 * silently stops growing while the framework's surface area expands —
 * `diagnose` returns "no match" more and more often, agents call it
 * fewer times, the loop closes.
 *
 * ## Mechanics
 *
 * 1. Get changed-file list via `git diff origin/${BASE_REF}...HEAD`.
 * 2. If no files touch the sensitive paths → exit 0 (gate not applicable).
 * 3. If `HAS_SKIP_LABEL=true` → exit 0 (deliberate bypass for genuinely
 *    catalog-irrelevant changes like internal-refactor / perf / type-only
 *    work).
 * 4. Count `ERROR_PATTERNS` entries in both `origin/${BASE_REF}` and HEAD
 *    versions of `react-intercept.ts`. If HEAD count > base count → pass.
 * 5. Otherwise → fail with a clear "add a new entry, or label to bypass"
 *    message.
 *
 * ## Mirrors `check-no-major-changesets.ts` shape
 *
 * Same approach: standalone script + dedicated lightweight workflow,
 * label-based bypass for cases that don't fit the rule. The contract
 * stays in code (the script), not in CI yaml (which just invokes it).
 */

import { execFileSync } from 'node:child_process'

const SENSITIVE_PATTERNS = [
  'packages/core/runtime-dom/',
  'packages/core/runtime-server/',
  'packages/core/core/',
  'packages/core/compiler/',
  'packages/core/router/',
]

const CATALOG_FILE = 'packages/core/compiler/src/react-intercept.ts'
const CATALOG_MARKER = 'const ERROR_PATTERNS: ErrorPattern[] = ['

// `BASE_REF` is supplied by CI from `github.event.pull_request.base.ref`,
// which IS attacker-influenceable (a PR can target any base branch).
// Validate it against a strict allowlist before any shell use to close the
// CodeQL "Indirect uncontrolled command line" finding (a malicious BASE_REF
// like `main; rm -rf /` would otherwise reach the shell).
const RAW_BASE_REF = process.env['BASE_REF'] || 'main'
if (!/^[a-zA-Z0-9._/-]+$/.test(RAW_BASE_REF)) {
  console.error(
    `[check-diagnose-catalog] FAILED — BASE_REF "${RAW_BASE_REF}" contains characters outside the allowed set [a-zA-Z0-9._/-]. Refusing to use it.`,
  )
  process.exit(1)
}
const BASE_REF = RAW_BASE_REF

const HAS_SKIP_LABEL = process.env['HAS_SKIP_LABEL'] === 'true'

/**
 * `git diff` / `git show` runner. Uses `execFileSync` (no shell parsing)
 * with discrete argv so even an unexpected character in a sanitized value
 * can't be interpreted as a shell metacharacter — defense in depth on top
 * of the BASE_REF allowlist.
 */
function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function changedFiles(): string[] {
  // `git diff --name-only` requires the merge-base form `${BASE_REF}...HEAD`
  // to compare only commits unique to HEAD, not the union of both branches'
  // changes since divergence. Matches the changeset-check workflow shape.
  try {
    const out = git('diff', '--name-only', `origin/${BASE_REF}...HEAD`)
    return out.length === 0 ? [] : out.split('\n')
  } catch {
    return []
  }
}

function touchesSensitivePaths(files: string[]): boolean {
  return files.some((f) => SENSITIVE_PATTERNS.some((p) => f.startsWith(p)))
}

/**
 * Count `ERROR_PATTERNS` entries in a snapshot of `react-intercept.ts`.
 * Strategy: find the marker, then count top-level `{ pattern:` openings
 * up to the matching closing `]`. Counting opening braces in the array
 * region is brittle if entries contain nested objects (they don't today,
 * but might tomorrow); count `pattern:` keys instead — each entry has
 * exactly one, by the type contract `{ pattern; diagnose; }`.
 */
function countCatalogEntries(source: string): number {
  const start = source.indexOf(CATALOG_MARKER)
  if (start === -1) return -1
  // Walk forward, counting matching brackets to find the closing `]` of
  // the array. Start AFTER the marker — the marker itself contains an
  // unrelated `[]` token (in `ErrorPattern[]`), so `indexOf('[', start)`
  // would catch that pair, not the array literal.
  const arrayStart = start + CATALOG_MARKER.length - 1 // position of the `[`
  if (source[arrayStart] !== '[') return -1
  let depth = 0
  let arrayEnd = -1
  for (let i = arrayStart; i < source.length; i++) {
    const c = source[i]
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        arrayEnd = i
        break
      }
    }
  }
  if (arrayEnd === -1) return -1
  const region = source.slice(arrayStart, arrayEnd)
  // Each ErrorPattern entry has exactly one `pattern:` key.
  const matches = region.match(/^\s*pattern:/gm)
  return matches?.length ?? 0
}

function readFileAt(ref: string, path: string): string | null {
  // `git` (execFileSync) keeps argv discrete — no shell interpolation,
  // no command-substitution risk. `ref` is `origin/${BASE_REF}` (BASE_REF
  // already allowlist-validated above); `path` is the constant
  // `CATALOG_FILE`. Belt-and-suspenders.
  try {
    return git('show', `${ref}:${path}`)
  } catch {
    return null
  }
}

function readFileAtHead(path: string): string | null {
  try {
    return git('show', `HEAD:${path}`)
  } catch {
    return null
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

const files = changedFiles()

if (!touchesSensitivePaths(files)) {
  console.log(
    '[check-diagnose-catalog] PR does not touch framework error-surface paths — gate not applicable.',
  )
  process.exit(0)
}

console.log(
  `[check-diagnose-catalog] Sensitive paths touched (${SENSITIVE_PATTERNS.filter((p) => files.some((f) => f.startsWith(p))).join(', ')}).`,
)

if (HAS_SKIP_LABEL) {
  console.log(
    '[check-diagnose-catalog] skip-diagnose-catalog label present — bypassing the gate.',
  )
  process.exit(0)
}

const baseSource = readFileAt(`origin/${BASE_REF}`, CATALOG_FILE)
if (baseSource === null) {
  console.log(
    `[check-diagnose-catalog] Could not read \`${CATALOG_FILE}\` from origin/${BASE_REF} — skipping (likely a first-time-add of the catalog file).`,
  )
  process.exit(0)
}

const headSource = readFileAtHead(CATALOG_FILE)
if (headSource === null) {
  console.error(
    `[check-diagnose-catalog] FAILED — \`${CATALOG_FILE}\` not present at HEAD. The catalog must exist for the diagnose tool to work.`,
  )
  process.exit(1)
}

const baseCount = countCatalogEntries(baseSource)
const headCount = countCatalogEntries(headSource)

if (baseCount < 0 || headCount < 0) {
  console.error(
    `[check-diagnose-catalog] FAILED — could not parse ERROR_PATTERNS array (base=${baseCount} head=${headCount}). The catalog file structure may have changed; update the marker in this script.`,
  )
  process.exit(1)
}

console.log(
  `[check-diagnose-catalog] ERROR_PATTERNS entries: base=${baseCount} → head=${headCount}.`,
)

if (headCount > baseCount) {
  console.log(
    `[check-diagnose-catalog] OK — catalog grew by ${headCount - baseCount} entry(s).`,
  )
  process.exit(0)
}

console.error(
  '[check-diagnose-catalog] FAILED — this PR touches framework error-surface code paths',
)
console.error(
  '  but ERROR_PATTERNS did not grow. Every bug fix in a framework subsystem that',
)
console.error(
  '  could surface as a user-visible error is an opportunity to teach the diagnose tool.',
)
console.error('')
console.error(
  `Either add a new entry to \`ERROR_PATTERNS\` in \`${CATALOG_FILE}\`:`,
)
console.error('')
console.error('  {')
console.error("    pattern: /your-error-regex/,")
console.error("    diagnose: () => ({ cause: '...', fix: '...', fixCode: '...' }),")
console.error('  },')
console.error('')
console.error(
  'Or, if this PR is genuinely catalog-irrelevant (internal refactor / perf-only /',
)
console.error(
  "type tightening / docs-only change in core), add the 'skip-diagnose-catalog' label",
)
console.error('to bypass.')
process.exit(1)
