/**
 * Tests for `scripts/scaffold-smoke.ts:shouldSkipIsolatedCell` — the
 * auto-skip detector for isolated cells that would fail structurally
 * because the workspace is ahead of npm.
 *
 * Why this matters: isolated scaffold-smoke cells (today only
 * `cpa-smoke-monorepo-vercel`) run `bun install` from INSIDE the
 * scaffolded project, which resolves `@pyreon/*` deps via the npm
 * registry — not via Pyreon's outer workspace. The scaffolder pins
 * `@pyreon/*` to `^${PYREON_VERSION}` (read from create-zero's own
 * package.json). When the workspace is ahead of npm:
 *
 *   1. `changeset-release/*` PR branch — bumped versions are about to
 *      be published by the same PR's merge but aren't on npm yet.
 *   2. Inter-release dev branches — between when a version-packages PR
 *      merges and when its release.yml run successfully publishes,
 *      every workspace carries the new versions but npm doesn't.
 *
 * `bun install` fails with "No version matching ^0.<next>.0 found
 * (but package exists)" for every framework package. The failure is
 * structural — the gate asserts published-version installability for
 * versions that aren't on npm yet.
 *
 * `shouldSkipIsolatedCell` detects both states (branch-name +
 * workspace-vs-npm). Non-isolated cells (5 of 6 today) keep running —
 * they install from REPO_ROOT (workspace resolution) and don't need
 * npm at all.
 */
import { shouldSkipIsolatedCell } from '../../../../../scripts/scaffold-smoke'

// Stubs that pretend "npm is unreachable" so the workspace-vs-npm
// check falls through and only branch-name + env-override matter for
// these cases. Real-network tests live further down.
const stubReadVersion = (v: string | null) => () => v
const stubFetchNpm = (v: string | null) => () => v

describe('scaffold-smoke shouldSkipIsolatedCell', () => {
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

  // ─── branch-name detection ──────────────────────────────────────────

  it('returns skip:false when GITHUB_HEAD_REF is unset AND workspace matches npm', () => {
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
    expect(result.reason).toBe('')
  })

  it('returns skip:false for a normal feature-branch PR with workspace matching npm', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
  })

  it('returns skip:false for a branch whose name CONTAINS but does not start with "changeset-release/"', () => {
    // Defensive: substring-match would false-positive here. Use startsWith.
    process.env['GITHUB_HEAD_REF'] = 'fix/parse-changeset-release/foo'
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
  })

  it('returns skip:true on the canonical changesets release PR branch', () => {
    process.env['GITHUB_HEAD_REF'] = 'changeset-release/main'
    const result = shouldSkipIsolatedCell()
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('changeset-release/main')
    expect(result.reason).toContain('not yet on npm')
  })

  it('returns skip:true on a non-main release PR branch (e.g. changeset-release/next)', () => {
    process.env['GITHUB_HEAD_REF'] = 'changeset-release/next'
    const result = shouldSkipIsolatedCell()
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('changeset-release/next')
  })

  // ─── env override ────────────────────────────────────────────────────

  it('returns skip:true when PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=1 even on a normal branch', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = '1'
    const result = shouldSkipIsolatedCell()
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE')
    expect(result.reason).toContain('local override')
  })

  it('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=0 does NOT skip (truthy-check is exact "1")', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = '0'
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
  })

  it('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=true does NOT skip (must be literal "1")', () => {
    process.env['GITHUB_HEAD_REF'] = 'fix/some-bug'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = 'true'
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
  })

  // ─── workspace-vs-npm detection ──────────────────────────────────────

  it('returns skip:true when workspace is ahead of npm (e.g. 0.27.0 > 0.26.3)', () => {
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.27.0'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('0.27.0')
    expect(result.reason).toContain('0.26.3')
    expect(result.reason).toContain("doesn't exist on npm")
  })

  it('returns skip:false when workspace matches npm exactly', () => {
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
  })

  it('returns skip:false when workspace TRAILS npm (npm shipped without us)', () => {
    // Edge case: a hand-published release made npm newer than the
    // workspace. Install would succeed; no skip needed.
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.26.3'),
      fetchNpmVersion: stubFetchNpm('0.27.0'),
    })
    expect(result.skip).toBe(false)
  })

  it('returns skip:false when npm is unreachable (defensive — fall through to runtime failure)', () => {
    // Defensive: if we can't reach npm, we don't know whether install
    // would succeed. Let the runtime install attempt make the call.
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.27.0'),
      fetchNpmVersion: stubFetchNpm(null),
    })
    expect(result.skip).toBe(false)
  })

  it('returns skip:false when workspace version cannot be read', () => {
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion(null),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(false)
  })

  it('compares semver correctly: 0.27.1 > 0.27.0', () => {
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.27.1'),
      fetchNpmVersion: stubFetchNpm('0.27.0'),
    })
    expect(result.skip).toBe(true)
  })

  it('compares semver correctly: 1.0.0 > 0.99.99', () => {
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('1.0.0'),
      fetchNpmVersion: stubFetchNpm('0.99.99'),
    })
    expect(result.skip).toBe(true)
  })

  // ─── precedence ──────────────────────────────────────────────────────

  it('env override takes precedence over the branch+npm checks', () => {
    process.env['GITHUB_HEAD_REF'] = 'changeset-release/main'
    process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = '1'
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.27.0'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(true)
    // env override reason wins
    expect(result.reason).toContain('PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE')
  })

  it('branch check takes precedence over npm check', () => {
    process.env['GITHUB_HEAD_REF'] = 'changeset-release/main'
    const result = shouldSkipIsolatedCell({
      readWorkspaceVersion: stubReadVersion('0.27.0'),
      fetchNpmVersion: stubFetchNpm('0.26.3'),
    })
    expect(result.skip).toBe(true)
    // branch reason wins
    expect(result.reason).toContain('changeset-release/main')
  })
})
