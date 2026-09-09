/**
 * `bun.lock`'s FORMAT VERSION must be the one the pinned bun can read.
 *
 * bun only REWRITES the lockfile when a resolution actually changes, so a
 * contributor can run a newer bun for weeks without touching it — and then the
 * first dependency bump silently upgrades the format. `.bun-version` pins
 * 1.3.14, which reads and writes `lockfileVersion: 1`; bun 1.4 writes 3. CI
 * installs with `--frozen-lockfile`, so the newer format arrives as
 *
 *     error: Unknown lockfile version
 *     UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'
 *
 * at the very first step — before typecheck, before any gate that could explain
 * it, and on every job that installs. Observed on a real PR as four separate red
 * checks with one cause (#3433).
 *
 * The gate ties the two facts together in BOTH directions: the lockfile must
 * carry the expected version, AND `.bun-version` must still be the pin that
 * expectation was written for. Bumping bun therefore has to visit this file,
 * which is the review moment where "does CI's bun read this lockfile?" gets
 * asked out loud rather than discovered by a queue of red checks.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * The bun `.bun-version` pins, and the lockfile format that bun writes.
 *
 * These move TOGETHER. If you are bumping bun: install with the new version,
 * read the `lockfileVersion` it wrote into `bun.lock`, and update both fields
 * here in the same commit.
 */
export const LOCKFILE_POLICY = {
  bunVersion: '1.3.14',
  lockfileVersion: 1,
} as const

export interface LockfileVerdict {
  ok: boolean
  /** Empty when ok; otherwise the whole message, ready to print. */
  error: string
}

/** The `lockfileVersion` a lockfile declares, or `null` when it declares none. */
export function readLockfileVersion(lockText: string): number | null {
  // A targeted read rather than a full parse: `bun.lock` is JSONC (it carries
  // trailing commas), so `JSON.parse` throws on the very file this gate exists
  // to inspect.
  const m = /"lockfileVersion"\s*:\s*(\d+)/.exec(lockText)
  return m === null ? null : Number(m[1])
}

/** Pure verdict, so the message is testable without a filesystem. */
export function checkLockfileVersion(
  lockText: string,
  bunVersionFile: string,
  policy: { bunVersion: string; lockfileVersion: number } = LOCKFILE_POLICY,
): LockfileVerdict {
  const pinned = bunVersionFile.trim()
  if (pinned !== policy.bunVersion) {
    return {
      ok: false,
      error:
        `[check-lockfile-version] FAILED — .bun-version pins ${pinned}, but this gate was written for ${policy.bunVersion}.\n\n` +
        `  Bumping bun changes the lockfile format it writes, so the two move together.\n` +
        `  Install with ${pinned}, read the "lockfileVersion" it wrote into bun.lock,\n` +
        `  and update LOCKFILE_POLICY in scripts/check-lockfile-version.ts to match.`,
    }
  }

  const found = readLockfileVersion(lockText)
  if (found === null) {
    return {
      ok: false,
      error:
        `[check-lockfile-version] FAILED — bun.lock declares no "lockfileVersion".\n\n` +
        `  Regenerate it with the pinned bun: bunx bun@${policy.bunVersion} install`,
    }
  }

  if (found !== policy.lockfileVersion) {
    const newer = found > policy.lockfileVersion
    return {
      ok: false,
      error:
        `[check-lockfile-version] FAILED — bun.lock is lockfileVersion ${found}, but the pinned bun (${policy.bunVersion}) reads ${policy.lockfileVersion}.\n\n` +
        (newer
          ? `  A newer bun regenerated it. CI installs with --frozen-lockfile and will fail at\n` +
            `  the FIRST step with "Unknown lockfile version" — on every job that installs,\n` +
            `  which reads as several unrelated red checks.\n\n`
          : `  An older bun regenerated it.\n\n`) +
        `  Fix: regenerate with the pinned version and commit the result.\n` +
        `    bunx bun@${policy.bunVersion} install\n\n` +
        `  bun only rewrites the lockfile when a resolution changes, which is why a\n` +
        `  mismatched local bun can go unnoticed until the first dependency edit.`,
    }
  }

  return { ok: true, error: '' }
}

function main(): void {
  const lock = readFileSync(join(ROOT, 'bun.lock'), 'utf8')
  const pin = readFileSync(join(ROOT, '.bun-version'), 'utf8')
  const verdict = checkLockfileVersion(lock, pin)
  if (!verdict.ok) {
    // eslint-disable-next-line no-console
    console.error(verdict.error)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(
    `[check-lockfile-version] bun.lock is lockfileVersion ${LOCKFILE_POLICY.lockfileVersion}, matching the pinned bun ${LOCKFILE_POLICY.bunVersion}.`,
  )
}

// Guarded so this file can be IMPORTED to unit-test its pure helpers.
if (import.meta.main) main()
