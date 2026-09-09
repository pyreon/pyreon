import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BUN_LOCKFILE_SUPPORT,
  checkLockfileVersion,
  readLockfileVersion,
} from '../../../../../scripts/check-lockfile-version'

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..')

// bun only REWRITES `bun.lock` when a resolution changes, so a contributor can
// run a newer bun for weeks without touching it — and then the first dependency
// bump silently upgrades the format. CI installs `--frozen-lockfile` and dies at
// the first step with `Unknown lockfile version`, on every job that installs,
// which reads as several unrelated red checks (observed on #3433).

describe('the lockfile format is one the pinned bun can read', () => {
  it('accepts the repository as it stands', () => {
    const lock = readFileSync(join(ROOT, 'bun.lock'), 'utf8')
    const pin = readFileSync(join(ROOT, '.bun-version'), 'utf8')
    expect(checkLockfileVersion(lock, pin)).toEqual({ ok: true, error: '' })
  })

  it('accepts the repository under EVERY bun the map knows', () => {
    // The gate must not depend on which of the pins is current, because two open
    // PRs disagree about it: this one landed against 1.3.14 while #3440 moves the
    // pin to 1.4.0, and whichever merges second must not turn the other red.
    const lock = readFileSync(join(ROOT, 'bun.lock'), 'utf8')
    for (const pin of Object.keys(BUN_LOCKFILE_SUPPORT)) {
      expect(checkLockfileVersion(lock, pin), pin).toEqual({ ok: true, error: '' })
    }
  })

  it('rejects a lockfile the pinned bun cannot read, and says which bun to use', () => {
    const v = checkLockfileVersion('{\n  "lockfileVersion": 3,\n}', '1.3.14')
    expect(v.ok).toBe(false)
    expect(v.error).toContain('lockfileVersion 3')
    expect(v.error).toContain('bunx bun@1.3.14 install')
    // The reason four checks go red at once is the part a reader needs.
    expect(v.error).toContain('Unknown lockfile version')
    // "Just regenerate" is not always right, and getting that wrong deletes
    // someone's fix rather than failing loudly: observed on #3433, where a
    // NESTED override (`overrides["@changesets/parse"]["js-yaml"]`) resolves to
    // 4.3.2 under bun 1.4 and to 4.3.1 under 1.3.14 — because 1.3.14 will not
    // apply an override to an entry the existing lock already satisfies — and
    // `--frozen-lockfile` passes either way.
    expect(v.error).toContain('SILENTLY DROPS')
    expect(v.error).toContain('bump .bun-version')
  })

  it('accepts BOTH formats under a bun that reads both — readability, not equality', () => {
    // The bug this replaced: an exact-pair gate would red on a version-3 lockfile
    // under a 1.4.0 pin, which CI installs from without complaint. A gate that
    // fails on correct state is worse than no gate. Measured on #3440's CI: bun
    // 1.4.0 ran `--frozen-lockfile` against the version-1 lockfile and succeeded.
    expect(checkLockfileVersion('{ "lockfileVersion": 1 }', '1.4.0').ok).toBe(true)
    expect(checkLockfileVersion('{ "lockfileVersion": 3 }', '1.4.0').ok).toBe(true)
  })

  it('rejects an OLDER lockfile too, without claiming a newer bun wrote it', () => {
    const v = checkLockfileVersion('{ "lockfileVersion": 0 }', '1.3.14')
    expect(v.ok).toBe(false)
    expect(v.error).toContain('An older bun regenerated it')
  })

  it('fails on a bun version nobody has measured, rather than guessing', () => {
    // The other half of the gate, and the reason it is not simply "read the pin
    // and trust it": a bump has to declare what the new bun accepts, which is the
    // review moment. Guessing would make the gate green while asserting nothing.
    const v = checkLockfileVersion('{ "lockfileVersion": 1 }', '9.9.9')
    expect(v.ok).toBe(false)
    expect(v.error).toContain('.bun-version pins 9.9.9')
    expect(v.error).toContain('BUN_LOCKFILE_SUPPORT')
    expect(v.error).toContain('Known: 1.3.14, 1.4.0')
  })

  it('reads the version out of JSONC, which is what bun.lock actually is', () => {
    // `bun.lock` carries trailing commas, so `JSON.parse` throws on the very
    // file this gate inspects — the read has to be targeted.
    expect(readLockfileVersion('{\n  "lockfileVersion": 1,\n  "x": [1,],\n}')).toBe(1)
    expect(readLockfileVersion('{ "other": 2 }')).toBeNull()
    expect(() => JSON.parse(readFileSync(join(ROOT, 'bun.lock'), 'utf8'))).toThrow()
  })

  it('a lockfile with no version at all is refused, not defaulted', () => {
    const v = checkLockfileVersion('{ "workspaces": {} }', '1.3.14')
    expect(v.ok).toBe(false)
    expect(v.error).toContain('declares no "lockfileVersion"')
  })
})
