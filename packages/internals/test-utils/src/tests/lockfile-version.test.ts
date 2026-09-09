import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkLockfileVersion,
  LOCKFILE_POLICY,
  readLockfileVersion,
} from '../../../../../scripts/check-lockfile-version'

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..')

// bun only REWRITES `bun.lock` when a resolution changes, so a contributor can
// run a newer bun for weeks without touching it — and then the first dependency
// bump silently upgrades the format. CI installs `--frozen-lockfile` and dies at
// the first step with `Unknown lockfile version`, on every job that installs,
// which reads as several unrelated red checks (observed on #3433).

describe('the lockfile format matches the pinned bun', () => {
  it('accepts the repository as it stands', () => {
    const lock = readFileSync(join(ROOT, 'bun.lock'), 'utf8')
    const pin = readFileSync(join(ROOT, '.bun-version'), 'utf8')
    expect(checkLockfileVersion(lock, pin)).toEqual({ ok: true, error: '' })
  })

  it('rejects a lockfile a newer bun regenerated, and says which bun to use', () => {
    const v = checkLockfileVersion('{\n  "lockfileVersion": 3,\n}', LOCKFILE_POLICY.bunVersion)
    expect(v.ok).toBe(false)
    expect(v.error).toContain('lockfileVersion 3')
    expect(v.error).toContain(`bunx bun@${LOCKFILE_POLICY.bunVersion} install`)
    // The reason four checks go red at once is the part a reader needs.
    expect(v.error).toContain('Unknown lockfile version')
  })

  it('rejects an OLDER lockfile too, without claiming a newer bun wrote it', () => {
    const v = checkLockfileVersion(
      `{ "lockfileVersion": ${LOCKFILE_POLICY.lockfileVersion - 1} }`,
      LOCKFILE_POLICY.bunVersion,
    )
    expect(v.ok).toBe(false)
    expect(v.error).toContain('An older bun regenerated it')
  })

  it('fails when the bun pin moves without the policy, in the same direction', () => {
    // The other half of the gate. Without it, bumping `.bun-version` leaves the
    // expectation pointing at the previous format and the gate goes green while
    // asserting the wrong thing — the list-checked-in-one-direction shape.
    const v = checkLockfileVersion(
      `{ "lockfileVersion": ${LOCKFILE_POLICY.lockfileVersion} }`,
      '9.9.9',
    )
    expect(v.ok).toBe(false)
    expect(v.error).toContain('.bun-version pins 9.9.9')
    expect(v.error).toContain('LOCKFILE_POLICY')
  })

  it('reads the version out of JSONC, which is what bun.lock actually is', () => {
    // `bun.lock` carries trailing commas, so `JSON.parse` throws on the very
    // file this gate inspects — the read has to be targeted.
    expect(readLockfileVersion('{\n  "lockfileVersion": 1,\n  "x": [1,],\n}')).toBe(1)
    expect(readLockfileVersion('{ "other": 2 }')).toBeNull()
    expect(() => JSON.parse(readFileSync(join(ROOT, 'bun.lock'), 'utf8'))).toThrow()
  })

  it('a lockfile with no version at all is refused, not defaulted', () => {
    const v = checkLockfileVersion('{ "workspaces": {} }', LOCKFILE_POLICY.bunVersion)
    expect(v.ok).toBe(false)
    expect(v.error).toContain('declares no "lockfileVersion"')
  })
})
