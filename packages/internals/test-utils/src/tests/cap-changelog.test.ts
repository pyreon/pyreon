import { describe, expect, it } from 'vitest'
import {
  capChangelogText,
  capDependencyBullets,
} from '../../../../../scripts/cap-changelog'

// Regression lock for the PR #1567 surface: `changeset version` writes the
// 0.x → 1.0.0 peer-dep cascade into the CHANGELOG heading AND the "Updated
// dependencies" bullets. `cap-version-bumps.ts` caps the version field +
// heading; pre-fix it left the bullets claiming `@pyreon/x@1.0.0` — a version
// that never publishes. These functions cap both.

const CHANGELOG = `# @pyreon/zero-content

## 1.0.0

### Minor Changes

- [#1575] Search results deep-link to the best-matching heading.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@1.0.0
  - @pyreon/head@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/zero@1.0.0

## 0.32.0

### Minor Changes

- [#1410] earlier release.
`

describe('capDependencyBullets', () => {
  it('caps every @pyreon/*@1.0.0 dependency bullet to the group target', () => {
    const out = capDependencyBullets(CHANGELOG, '0.33.0')
    expect(out).toContain('- @pyreon/core@0.33.0')
    expect(out).toContain('- @pyreon/reactivity@0.33.0')
    expect(out).toContain('- @pyreon/zero@0.33.0')
    expect(out).not.toContain('@1.0.0')
  })

  it('is a no-op when groupTarget is null (no fixed member cascaded)', () => {
    expect(capDependencyBullets(CHANGELOG, null)).toBe(CHANGELOG)
  })

  it('does NOT touch inline prose mentioning a literal 1.0.0 (no `- ` bullet prefix)', () => {
    // The shape from @pyreon/reactivity's real changelog — a 1.0.0 inside prose,
    // preceded by `/`, not a dependency bullet.
    const prose =
      "  `pyreon doctor`'s regex parsed `/@pyreon/core@1.0.0(react@19.0.0):` keys…"
    expect(capDependencyBullets(prose, '0.33.0')).toBe(prose)
  })

  it('leaves a non-@pyreon dependency bullet at 1.0.0 alone', () => {
    const other = '  - some-other-lib@1.0.0'
    expect(capDependencyBullets(other, '0.33.0')).toBe(other)
  })

  it('is idempotent', () => {
    const once = capDependencyBullets(CHANGELOG, '0.33.0')
    expect(capDependencyBullets(once, '0.33.0')).toBe(once)
  })
})

describe('capChangelogText', () => {
  it('caps BOTH the ## 1.0.0 heading and the dependency bullets', () => {
    const out = capChangelogText(CHANGELOG, '0.33.0', '0.33.0')
    expect(out).toContain('## 0.33.0')
    expect(out).not.toMatch(/^## 1\.0\.0$/m)
    expect(out).toContain('- @pyreon/core@0.33.0')
    expect(out).not.toContain('@1.0.0')
  })

  it('only rewrites the FIRST (just-added) heading, leaving older sections intact', () => {
    const twoNewReleases = '## 1.0.0\n\nbody\n\n## 1.0.0\n\nolder\n'
    const out = capChangelogText(twoNewReleases, '0.33.0', '0.33.0')
    // First heading capped; the (hypothetical) second 1.0.0 heading is left —
    // the version field cap only produces ONE just-added 1.0.0 section.
    expect(out).toBe('## 0.33.0\n\nbody\n\n## 1.0.0\n\nolder\n')
  })

  it('uses the package own target for the heading, the group target for bullets', () => {
    // A non-fixed package capped to its own next-minor whose bullets point at
    // fixed-group members released at the group target.
    const cl = '## 1.0.0\n\n- Updated dependencies []:\n  - @pyreon/core@1.0.0\n'
    const out = capChangelogText(cl, '0.2.0', '0.33.0')
    expect(out).toContain('## 0.2.0')
    expect(out).toContain('- @pyreon/core@0.33.0')
  })
})
