import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API_REFERENCE } from '../api-reference'
import { loadPatternRegistry } from '../patterns'

// Content-quality test for the patterns corpus. Catches drift that
// `loadPatternRegistry` and the seeAlso consistency test don't see:
//
//  (a) Structural shape — every pattern must follow the standardised
//      # Title / ## Anti-pattern / ## Related skeleton so the MCP
//      response has predictable content sections. A file missing any
//      of these is incomplete doc content; failing the build beats
//      shipping a half-written pattern.
//  (b) Detector references — every `Detector: \`<code>\`` mention in
//      prose must match a real `PyreonDiagnosticCode`. A rename in
//      the detector without updating the pattern writes a footer
//      that points at a ghost code.
//  (c) get_api references — every `get_api({ package: "X", symbol:
//      "Y" })` prose call with a CONCRETE symbol must resolve in
//      API_REFERENCE. A rename or deletion of an API entry without
//      updating the pattern leaves an AI agent chasing a 404.

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → mcp/ → tools/ → packages/ → repo root (5 ups)
const REPO_ROOT = resolve(HERE, '../../../../../')

// Must stay in sync with `PyreonDiagnosticCode` in
// `packages/core/compiler/src/pyreon-intercept.ts`. Consistency with
// that source is enforced by `detector-tag-consistency.test.ts` in
// the compiler package — we hardcode it here to avoid a cross-package
// runtime import that would complicate bundling.
const KNOWN_DETECTOR_CODES = new Set([
  'for-missing-by',
  'for-with-key',
  'props-destructured',
  'process-dev-gate',
  'empty-theme',
  'raw-add-event-listener',
  'raw-remove-event-listener',
  'date-math-random-id',
  'on-click-undefined',
])

describe('patterns content — structural shape', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it.each(registry.patterns.map((p) => [p.name, p.path]))(
    '%s has exactly one top-level # heading',
    (_name, path) => {
      const body = readFileSync(path, 'utf8')
      const h1Count = body.split('\n').filter((l) => /^# /.test(l)).length
      expect(h1Count).toBe(1)
    },
  )

  it.each(registry.patterns.map((p) => [p.name, p.path]))(
    '%s has a ## Anti-pattern section',
    (_name, path) => {
      const body = readFileSync(path, 'utf8')
      // Match the heading at column 0, so "## Anti-pattern" and
      // "## Anti-pattern (something)" both pass but "### Anti-pattern"
      // (nested) does not.
      const hasAnti = /^## Anti-pattern/m.test(body)
      expect(hasAnti).toBe(true)
    },
  )

  it.each(registry.patterns.map((p) => [p.name, p.path]))(
    '%s has a ## Related section',
    (_name, path) => {
      const body = readFileSync(path, 'utf8')
      const hasRelated = /^## Related/m.test(body)
      expect(hasRelated).toBe(true)
    },
  )
})

describe('patterns content — detector code references are real', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it('every `Detector: \\`<code>\\`` reference names a known PyreonDiagnosticCode', () => {
    const unknown: Array<{ pattern: string; code: string }> = []
    for (const p of registry.patterns) {
      const body = readFileSync(p.path, 'utf8')
      // Matches lines like "- Detector: `for-missing-by`" or
      // "- Detector: `raw-add-event-listener` / `raw-remove-event-listener`"
      const rx = /Detector: `([a-z0-9-]+)`/g
      for (const m of body.matchAll(rx)) {
        const code = m[1]!
        if (!KNOWN_DETECTOR_CODES.has(code)) {
          unknown.push({ pattern: p.name, code })
        }
      }
    }
    // If this fails, either (a) the detector code was renamed and
    // the pattern still cites the old name — fix the pattern —
    // or (b) a new detector code was added and `KNOWN_DETECTOR_CODES`
    // in this test is stale — add the new code here AND in
    // `pyreon-intercept.ts`.
    expect(unknown).toEqual([])
  })
})

describe('patterns content — get_api references resolve', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it('every concrete `get_api({ package, symbol })` reference exists in API_REFERENCE', () => {
    const dangling: Array<{ pattern: string; key: string }> = []
    for (const p of registry.patterns) {
      const body = readFileSync(p.path, 'utf8')
      // Matches: get_api({ package: "hooks", symbol: "useEventListener" })
      // Skips placeholder symbol values like "..." via the character class.
      const rx = /get_api\(\{\s*package:\s*"([a-z-]+)"\s*,\s*symbol:\s*"([a-zA-Z]+)"\s*\}\)/g
      for (const m of body.matchAll(rx)) {
        const key = `${m[1]}/${m[2]}`
        if (!API_REFERENCE[key]) {
          dangling.push({ pattern: p.name, key })
        }
      }
    }
    // If this fails, the API entry was renamed or removed but the
    // pattern still cites the old key. Either update the pattern or
    // restore the API entry.
    expect(dangling).toEqual([])
  })

  it('every documented package slug matches a real @pyreon/<pkg>', () => {
    // Any `get_api({ package: "X" })` whose X is not a valid scope
    // would pass the key check only if the symbol happens not to
    // exist (null match). This assertion checks packages regardless
    // of whether a concrete symbol was provided.
    const knownPackages = new Set(Object.keys(API_REFERENCE).map((k) => k.split('/')[0]))
    const unknown: Array<{ pattern: string; pkg: string }> = []
    for (const p of registry.patterns) {
      const body = readFileSync(p.path, 'utf8')
      const rx = /get_api\(\{\s*package:\s*"([a-z-]+)"/g
      for (const m of body.matchAll(rx)) {
        const pkg = m[1]!
        if (!knownPackages.has(pkg)) {
          unknown.push({ pattern: p.name, pkg })
        }
      }
    }
    expect(unknown).toEqual([])
  })
})
