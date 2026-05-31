/**
 * Tests for `scripts/scaffold-smoke.ts:isReleasePR` — the auto-skip
 * detector for changesets release PRs.
 *
 * Why this matters: isolated scaffold-smoke cells (today only
 * `cpa-smoke-monorepo-vercel`) run `bun install` from INSIDE the
 * scaffolded project, which resolves `@pyreon/*` deps via the npm
 * registry — not via Pyreon's outer workspace. The scaffolder pins
 * `@pyreon/*` to `^${PYREON_VERSION}` (read from create-zero's own
 * package.json). On the changesets release PR branch (`changeset-
 * release/<target>`), those versions are the freshly-bumped values
 * the release would publish on merge — but they aren't on npm yet.
 *
 * `bun install` fails with "No version matching ^0.<next>.0 found
 * (but package exists)" for every framework package. The failure is
 * structural — the release PR is the ACT of publishing those versions,
 * so a gate that asserts published-version installability for them
 * fundamentally cannot pass before merge.
 *
 * `isReleasePR` detects this state via `GITHUB_HEAD_REF`. CI runs
 * isolated cells through the normal path on every other PR (where the
 * gate's value is real); the release PR auto-skips with a clear,
 * logged reason.
 *
 * Non-isolated cells (5 of 6 today) keep running on the release PR
 * — they install from REPO_ROOT (workspace resolution) and don't need
 * npm at all.
 */
import { isReleasePR } from '../../../../../scripts/scaffold-smoke'

describe('scaffold-smoke isReleasePR', () => {
  const originalHeadRef = process.env['GITHUB_HEAD_REF']
  const originalOverride = process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE']

  beforeEach(() => {
    // Start each test from a known-clean env so the prior test can't
    // leak state through the live process.env.
    delete process.env['GITHUB_HEAD_REF']
    delete process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE']
  })

  afterAll(() => {
    // Restore the original env after the suite so subsequent test files
    // see the same shell environment they started with.
    if (originalHeadRef === undefined) delete process.env['GITHUB_HEAD_REF']
    else process.env['GITHUB_HEAD_REF'] = originalHeadRef
    if (originalOverride === undefined) delete process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE']
    else process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = originalOverride
  })

  it('returns skip:false when GITHUB_HEAD_REF is unset (typical local / push event)', () => {
    const result = isReleasePR()
    expect(result.skip).toBe(false)
    expect(result.reason).toBe('')
  })

  it('returns skip:false for a normal feature-branch PR', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    const result = isReleasePR()
    expect(result.skip).toBe(false)
  })

  it('returns skip:false for a branch whose name CONTAINS but does not start with "changeset-release/"', () => {
    // Defensive: substring-match would false-positive here. Use startsWith.
    process.env['GITHUB_HEAD_REF'] = 'fix/parse-changeset-release/foo'
    const result = isReleasePR()
    expect(result.skip).toBe(false)
  })

  it('returns skip:true on the canonical changesets release PR branch', () => {
    process.env['GITHUB_HEAD_REF'] = 'changeset-release/main'
    const result = isReleasePR()
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('changeset-release/main')
    expect(result.reason).toContain('not yet on npm')
  })

  it('returns skip:true on a non-main release PR branch (e.g. changeset-release/next)', () => {
    // The pattern is `changeset-release/<target-branch>`, so any
    // non-main release target should also be recognised.
    process.env['GITHUB_HEAD_REF'] = 'changeset-release/next'
    const result = isReleasePR()
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('changeset-release/next')
  })

  it('returns skip:true when PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=1 even on a normal branch', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = '1'
    const result = isReleasePR()
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE')
    expect(result.reason).toContain('local override')
  })

  it('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=0 does NOT skip (truthy-check is exact "1")', () => {
    // Defensive: the docs say "set to 1", not "set to anything".
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = '0'
    const result = isReleasePR()
    expect(result.skip).toBe(false)
  })

  it('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=true does NOT skip (must be literal "1")', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = 'true'
    const result = isReleasePR()
    expect(result.skip).toBe(false)
  })
})
