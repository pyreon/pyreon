import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Drift guard between Pyreon's static detectors (compiler + lint) and the
// `[detector: <code>]` annotations on `.claude/rules/anti-patterns.md`.
// Without this test, a new bullet can land without a detector tag, or
// a detector code can be renamed without updating the doc. Either
// direction is a silent inconsistency — consumers read the doc and
// expect the detector to back it up.
//
// The test does one thing: every `[detector: CODE]` tag in the doc
// must reference a known detector (compiler PyreonDiagnosticCode OR
// @pyreon/lint rule ID without the `pyreon/` prefix), and every
// compiler PyreonDiagnosticCode must appear at least once in the doc
// so the tag-documentation loop is closed.
//
// Lint rules are NOT required to appear in anti-patterns.md (some are
// stylistic, not anti-pattern shaped). When they DO appear with a
// `[detector:]` tag, the tag must match the rule ID's local part.

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../../../')
const ANTI_PATTERNS_PATH = resolve(REPO_ROOT, '.claude/rules/anti-patterns.md')

// Kept in sync with the `PyreonDiagnosticCode` union in
// `pyreon-intercept.ts`. When adding a new code, ALSO add a bullet
// (with the `[detector: <code>]` tag) to `anti-patterns.md`.
const COMPILER_CODES = [
  'for-missing-by',
  'for-with-key',
  'props-destructured',
  'process-dev-gate',
  'empty-theme',
  'raw-add-event-listener',
  'raw-remove-event-listener',
  'date-math-random-id',
  'on-click-undefined',
  'signal-write-as-call',
  'static-return-null-conditional',
  'as-unknown-as-vnodechild',
  'island-never-with-registry-entry',
] as const
type CompilerCode = (typeof COMPILER_CODES)[number]

// `@pyreon/lint` rule IDs that may appear as `[detector:]` tags. Listed
// WITHOUT the `pyreon/` prefix (the tag convention strips it for
// readability). Add the rule ID here when documenting a new lint rule
// in anti-patterns.md.
const LINT_RULE_DETECTORS = [
  'storage-signal-v-forwarding',
] as const

function readAntiPatterns(): string {
  return readFileSync(ANTI_PATTERNS_PATH, 'utf8')
}

function extractDetectorTags(doc: string): string[] {
  const re = /\[detector:\s*([a-z-/ ]+?)\]/gi
  const found: string[] = []
  for (const m of doc.matchAll(re)) {
    // Some bullets document multiple codes on one pattern, e.g.
    // `[detector: raw-add-event-listener / raw-remove-event-listener]`.
    const raw = m[1]!
    for (const code of raw.split('/')) {
      const trimmed = code.trim()
      if (trimmed) found.push(trimmed)
    }
  }
  return found
}

describe('anti-patterns.md detector tags vs static detectors', () => {
  const doc = readAntiPatterns()
  const tags = extractDetectorTags(doc)

  it('every [detector: CODE] tag references a known detector (compiler or lint)', () => {
    const validCodes = new Set<string>([...COMPILER_CODES, ...LINT_RULE_DETECTORS])
    const unknown = tags.filter((t) => !validCodes.has(t) && t !== 'N/A')
    expect(unknown).toEqual([])
  })

  it('every PyreonDiagnosticCode appears at least once as a [detector:] tag', () => {
    const tagSet = new Set(tags)
    const missing: CompilerCode[] = []
    for (const code of COMPILER_CODES) {
      if (!tagSet.has(code)) missing.push(code)
    }
    // If this fails, add a bullet for the new detector code to
    // `.claude/rules/anti-patterns.md` with the `[detector: <code>]`
    // suffix. The doc is the human-readable catalog; the detector is
    // the static enforcement arm — they have to name each other.
    expect(missing).toEqual([])
  })

  it('reports at least as many tags as compiler detector codes (multi-code bullets allowed)', () => {
    expect(tags.length).toBeGreaterThanOrEqual(COMPILER_CODES.length)
  })
})
