/**
 * Contract for `scripts/heal-release-chain.ts` — the decision logic that
 * replaced the umbrella step's `if: outputs.published == 'true'` gate.
 *
 * The class being retired: changesets/action pushes per-package tags AFTER
 * `npm publish` and sets its outputs AFTER the pushes, so one transient
 * tag-push failure (v0.50.0: `remote: fatal error in commit_refs`) left
 * `outputs.published` unset, the umbrella step skipped, no `v0.50.0` tag was
 * created, release-native never fired, and the native binaries silently froze
 * at 0.48.0. Same shape ate v0.46.0 and v0.49.0. The healer decides from
 * ground truth (npm + origin), so these specs pin the decision table.
 */
import { describe, expect, it } from 'vitest'
import { parsePublishResult, planHeal, resolveBumpCommit, validateReleaseVersion } from '../../../../../scripts/heal-release-chain'

const HEALTHY = {
  npmHasVersion: true,
  originHasUmbrellaTag: true,
  nativeRunExists: true,
  npmHasNativeBinaries: true,
  releaseExists: true,
}

describe('planHeal — the decision table', () => {
  it('unpublished version → do NOTHING (Version-PR path / dead release)', () => {
    // The dead-release alarm belongs to check-published-state; the healer
    // must never tag or dispatch for a version npm has not confirmed.
    expect(planHeal({ ...HEALTHY, npmHasVersion: false, originHasUmbrellaTag: false })).toEqual([])
  })

  it('fully healthy chain → nothing to do', () => {
    expect(planHeal(HEALTHY)).toEqual([])
  })

  it('the v0.50.0 incident: published, no tag, no native run, no binaries, no release', () => {
    expect(
      planHeal({
        npmHasVersion: true,
        originHasUmbrellaTag: false,
        nativeRunExists: false,
        npmHasNativeBinaries: false,
        releaseExists: false,
      }),
    ).toEqual(['push-umbrella-tag', 'dispatch-native', 'create-release'])
  })

  it('ORDER is load-bearing: tag before dispatch before release', () => {
    // release-native checks out the tag ref; gh release create uses
    // --verify-tag. Both die if the tag does not exist yet.
    const actions = planHeal({
      npmHasVersion: true,
      originHasUmbrellaTag: false,
      nativeRunExists: false,
      npmHasNativeBinaries: false,
      releaseExists: false,
    })
    expect(actions.indexOf('push-umbrella-tag')).toBeLessThan(actions.indexOf('dispatch-native'))
    expect(actions.indexOf('push-umbrella-tag')).toBeLessThan(actions.indexOf('create-release'))
  })

  it('does NOT dispatch when a native run already exists — even a FAILED one', () => {
    // A failed run is visible and owned by whoever reads it; re-dispatching
    // on top would attempt a republish and manufacture a second failure.
    expect(
      planHeal({ ...HEALTHY, nativeRunExists: true, npmHasNativeBinaries: false }),
    ).toEqual([])
  })

  it('does NOT dispatch when the binaries are already on npm (manual bootstrap covered it)', () => {
    expect(
      planHeal({ ...HEALTHY, nativeRunExists: false, npmHasNativeBinaries: true }),
    ).toEqual([])
  })

  it('dispatches ONLY when both native signals are absent', () => {
    expect(
      planHeal({ ...HEALTHY, nativeRunExists: false, npmHasNativeBinaries: false }),
    ).toEqual(['dispatch-native'])
  })

  it('missing GitHub Release alone → just create it', () => {
    expect(planHeal({ ...HEALTHY, releaseExists: false })).toEqual(['create-release'])
  })
})

describe('resolveBumpCommit — tag the bump, not HEAD', () => {
  // Newest-first log, the way `git log` emits it.
  const SHAS = ['newest', 'mid2', 'mid1', 'bump', 'older1', 'older2'] as const
  const versions: Record<string, string> = {
    newest: '0.51.0',
    mid2: '0.51.0',
    mid1: '0.51.0',
    bump: '0.51.0',
    older1: '0.50.0',
    older2: '0.50.0',
  }
  const at = (sha: string): string | null => versions[sha] ?? null

  it('returns the OLDEST commit carrying the version — the version-bump merge', () => {
    expect(resolveBumpCommit(SHAS, at, '0.51.0')).toBe('bump')
  })

  it('healing a PAST version finds ITS bump window, not the current one', () => {
    // The v0.50.0 heal ran long after 0.51.0 commits landed on top.
    expect(resolveBumpCommit(SHAS, at, '0.50.0')).toBe('older2')
  })

  it('stops scanning once it leaves the version window', () => {
    let calls = 0
    const counting = (sha: string): string | null => {
      calls++
      return at(sha)
    }
    resolveBumpCommit(SHAS, counting, '0.51.0')
    // newest..bump (4) + one look past the window (older1) = 5, not all 6.
    expect(calls).toBe(5)
  })

  it('returns null when no commit carries the version (caller falls back to HEAD)', () => {
    expect(resolveBumpCommit(SHAS, at, '0.49.0')).toBeNull()
  })

  it('tolerates commits where the anchor file is unreadable', () => {
    const flaky = (sha: string): string | null => (sha === 'mid1' ? null : at(sha))
    // mid1 unreadable breaks the contiguous window at the newest side — the
    // conservative answer is the oldest CONTIGUOUS match seen before the gap.
    expect(resolveBumpCommit(SHAS, flaky, '0.51.0')).toBe('mid2')
  })
})

describe('validateReleaseVersion — the file-data → URL/argv barrier', () => {
  it('accepts plain release versions and prerelease suffixes', () => {
    expect(validateReleaseVersion('0.51.0')).toBe('0.51.0')
    expect(validateReleaseVersion('1.2.3-alpha-20260810')).toBe('1.2.3-alpha-20260810')
  })

  it('rejects anything that could alter a URL path or be parsed as a CLI flag', () => {
    // The version flows into the registry URL, git tag names, and gh argv —
    // a corrupt/hostile package.json must stop the healer, not steer it.
    for (const bad of [
      '../0.51.0',
      '0.51.0/../../evil',
      '--force',
      '0.51.0 --tags',
      'v0.51.0', // the tag prefix is OURS to add, not the file's
      '',
      undefined,
      42,
    ]) {
      expect(validateReleaseVersion(bad), String(bad)).toBeNull()
    }
  })
})

describe('parsePublishResult — phase 1 local truth must be SOUND or absent', () => {
  it('accepts a valid manifest', () => {
    const text = JSON.stringify({ version: '0.51.0', published: ['@pyreon/core'] })
    expect(parsePublishResult(text)).toEqual({ version: '0.51.0', published: ['@pyreon/core'] })
  })

  it('absent file → null (the Version-PR path)', () => {
    expect(parsePublishResult(null)).toBeNull()
  })

  it('malformed JSON → null, never a throw — the always() step must not crash', () => {
    expect(parsePublishResult('{oops')).toBeNull()
  })

  it('nothing published → null (a publish run that skipped everything)', () => {
    expect(parsePublishResult(JSON.stringify({ version: '0.51.0', published: [] }))).toBeNull()
  })

  it('non-semver version → null — phase 1 must never tag garbage', () => {
    expect(
      parsePublishResult(JSON.stringify({ version: '--force', published: ['@pyreon/core'] })),
    ).toBeNull()
  })

  it('non-string entries in published → null', () => {
    expect(
      parsePublishResult(JSON.stringify({ version: '0.51.0', published: [42] })),
    ).toBeNull()
  })
})
