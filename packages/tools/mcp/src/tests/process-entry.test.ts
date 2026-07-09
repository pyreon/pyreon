import { describe, expect, it } from 'vitest'
import { matchesProcessEntry } from '../index'

// Regression lock for the CLI-liveness bug class: `pyreon-mcp`'s bin was
// gated on `import.meta.main` alone, which is `undefined` on Node 20/22 LTS
// (only Bun + Node >=24.2 define it) → the stdio server silently never
// started there. `matchesProcessEntry` is the cross-runtime replacement:
// use the boolean when present, else fall back to a file:// URL comparison.
describe('matchesProcessEntry (cross-runtime bin entry detection)', () => {
  const url = 'file:///pkg/lib/index.js'

  it('trusts import.meta.main when it is a boolean (Bun / Node >=24.2)', () => {
    expect(matchesProcessEntry(true, url, 'file:///anything.js')).toBe(true)
    // A real boolean `false` (imported, not entry) must NOT fall through to
    // the path comparison — even if the paths happen to match.
    expect(matchesProcessEntry(false, url, url)).toBe(false)
  })

  it('falls back to URL comparison on Node LTS (import.meta.main === undefined)', () => {
    // THE bug path: undefined meta + entry === this module → must be true,
    // so the LTS bin actually starts the server.
    expect(matchesProcessEntry(undefined, url, url)).toBe(true)
    // Imported by a test/other package on LTS: entry differs → false.
    expect(matchesProcessEntry(undefined, url, 'file:///other/entry.js')).toBe(false)
    // Entry could not be resolved (realpath threw) → false, never crash.
    expect(matchesProcessEntry(undefined, url, null)).toBe(false)
  })
})
