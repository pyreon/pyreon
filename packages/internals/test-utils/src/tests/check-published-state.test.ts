import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cmpSemver,
  NATIVE_SENTINELS,
  repoVersion,
  resolveSentinels,
  SENTINELS,
} from '../../../../../scripts/check-published-state'

// The repo root, found by walking up to the `.changeset/config.json` marker —
// robust regardless of vitest's cwd / module-URL virtualization (the script's
// own `import.meta.url`-derived root isn't reliable when imported under vitest,
// which is exactly why `repoVersion` takes an explicit `root`).
function findRepoRoot(from: string): string {
  let dir = from
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, '.changeset', 'config.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('repo root not found from ' + from)
}
const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)))

// Guards the native-binary coverage added to the daily published-state check.
// The gap it closes: a native-binary cascade failure (JS published, but the
// tag→release-native step failed / the tag never pushed) left `@pyreon/
// compiler-*` a version behind npm with no automated alarm — the historical
// skew class. The daily run now passes `--native`; the in-release run does not
// (native isn't on npm yet when it fires).

describe('check-published-state — resolveSentinels (native gating)', () => {
  it('excludes native binaries by default — the in-release check runs BEFORE native publishes', () => {
    expect(resolveSentinels(false)).toEqual(SENTINELS)
    for (const nat of NATIVE_SENTINELS) {
      expect(resolveSentinels(false)).not.toContain(nat)
    }
  })

  it('includes the native binary with --native — the daily check runs AFTER native publishes', () => {
    const s = resolveSentinels(true)
    for (const js of SENTINELS) expect(s).toContain(js)
    for (const nat of NATIVE_SENTINELS) expect(s).toContain(nat)
    expect(s.length).toBe(SENTINELS.length + NATIVE_SENTINELS.length)
  })
})

describe('check-published-state — cmpSemver (dead-release direction)', () => {
  // The gate flags DEAD when `cmpSemver(repo, npm) > 0` (repo ahead of npm).
  it('repo ahead of npm → positive (released but not published = DEAD)', () => {
    expect(cmpSemver('0.39.0', '0.38.0')).toBeGreaterThan(0)
    expect(cmpSemver('0.38.1', '0.38.0')).toBeGreaterThan(0)
    expect(cmpSemver('1.0.0', '0.38.0')).toBeGreaterThan(0)
  })
  it('repo == npm → 0 (healthy); prerelease suffix ignored', () => {
    expect(cmpSemver('0.38.0', '0.38.0')).toBe(0)
    expect(cmpSemver('0.38.0-alpha-20260101', '0.38.0')).toBe(0)
  })
  it('repo behind npm → negative (never flagged as dead)', () => {
    expect(cmpSemver('0.37.1', '0.38.0')).toBeLessThan(0)
  })
})

describe('check-published-state — repoVersion resolves the native binary path', () => {
  it('locates @pyreon/compiler-darwin-arm64 (packages/core/compiler/npm/darwin-arm64)', () => {
    // Reads the real repo. The native stub is version-bumped in LOCKSTEP with
    // the JS core (both in the changeset fixed group), so it must resolve to the
    // SAME version — version-independent, robust across releases. If the native
    // path-resolution regressed, this throws "cannot locate … in the workspace".
    const core = repoVersion('@pyreon/core', REPO_ROOT)
    const nativeBin = repoVersion('@pyreon/compiler-darwin-arm64', REPO_ROOT)
    expect(nativeBin).toMatch(/^\d+\.\d+\.\d+$/)
    expect(nativeBin).toBe(core)
  })
})
