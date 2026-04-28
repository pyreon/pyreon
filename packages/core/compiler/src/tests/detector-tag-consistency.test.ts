import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Drift guard between the static `detectPyreonPatterns` detector codes
// and the `[detector: <code>]` annotations on `.claude/rules/anti-patterns.md`.
// Without this test, a new bullet can land without a detector tag, or
// a detector code can be renamed without updating the doc. Either
// direction is a silent inconsistency — consumers read the doc and
// expect the detector to back it up.
//
// The test does one thing: every `[detector: CODE]` tag in the doc
// must reference a PyreonDiagnosticCode (or the literal `N/A` for
// bullets explicitly declared doc-only), and every
// PyreonDiagnosticCode must appear at least once in the doc so the
// tag-documentation loop is closed.

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../../../')
const ANTI_PATTERNS_PATH = resolve(REPO_ROOT, '.claude/rules/anti-patterns.md')

// Kept in sync with the `PyreonDiagnosticCode` union in
// `pyreon-intercept.ts`. When adding a new code, ALSO add a bullet
// (with the `[detector: <code>]` tag) to `anti-patterns.md`.
const KNOWN_CODES = [
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
] as const
type KnownCode = (typeof KNOWN_CODES)[number]

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

describe('anti-patterns.md detector tags vs PyreonDiagnosticCode', () => {
  const doc = readAntiPatterns()
  const tags = extractDetectorTags(doc)

  it('every [detector: CODE] tag references a known PyreonDiagnosticCode', () => {
    const validCodes = new Set<string>(KNOWN_CODES)
    const unknown = tags.filter((t) => !validCodes.has(t) && t !== 'N/A')
    expect(unknown).toEqual([])
  })

  it('every PyreonDiagnosticCode appears at least once as a [detector:] tag', () => {
    const tagSet = new Set(tags)
    const missing: KnownCode[] = []
    for (const code of KNOWN_CODES) {
      if (!tagSet.has(code)) missing.push(code)
    }
    // If this fails, add a bullet for the new detector code to
    // `.claude/rules/anti-patterns.md` with the `[detector: <code>]`
    // suffix. The doc is the human-readable catalog; the detector is
    // the static enforcement arm — they have to name each other.
    expect(missing).toEqual([])
  })

  it('reports at least as many tags as detector codes (multi-code bullets allowed)', () => {
    expect(tags.length).toBeGreaterThanOrEqual(KNOWN_CODES.length)
  })
})
