/**
 * `scripts/cap-changeset-bumps.ts` — the 0.x severity cap must touch ONLY the
 * frontmatter. Its line regex (`<key>: major`) also matches English, and a
 * changeset body is copied verbatim into `CHANGELOG.md`, so a whole-file
 * replace shipped `Impact: minor` for an author who wrote `Impact: major` —
 * the published changelog inverted, after review, during release.
 */
import { describe, expect, it } from 'vitest'
import { capChangesetText } from '../../../../../scripts/cap-changeset-bumps'

const FILE = `---
'@pyreon/core': major
"@pyreon/router": major
'@pyreon/head': patch
---

Impact: major

Breaking-change risk: major — this drops the legacy shim.
`

describe('capChangesetText', () => {
  it('downgrades every `major` in the frontmatter', () => {
    const out = capChangesetText(FILE)
    expect(out).toContain(`'@pyreon/core': minor`)
    expect(out).toContain(`"@pyreon/router": minor`)
    expect(out).toContain(`'@pyreon/head': patch`)
  })

  it('leaves the BODY prose untouched', () => {
    const out = capChangesetText(FILE)
    expect(out).toContain('Impact: major\n')
    expect(out).toContain('Breaking-change risk: major — this drops the legacy shim.')
  })

  it('is a no-op without a frontmatter block, and idempotent', () => {
    expect(capChangesetText('Impact: major\n')).toBe('Impact: major\n')
    const once = capChangesetText(FILE)
    expect(capChangesetText(once)).toBe(once)
  })
})

describe('capChangesetText — CRLF frontmatter', () => {
  // The splice used a hardcoded fence length of 4 (`---\n`); a CRLF file's
  // fence is 5 bytes, so the cap dropped the fence's newline and duplicated a
  // byte of the frontmatter — unparseable YAML at release time.
  it('keeps a CRLF fence intact and caps the bump', () => {
    const crlf = "---\r\n'@pyreon/core': major\r\n---\r\n\r\nBody\r\n"
    const out = capChangesetText(crlf)
    expect(out).toBe("---\r\n'@pyreon/core': minor\r\n---\r\n\r\nBody\r\n")
  })
})
