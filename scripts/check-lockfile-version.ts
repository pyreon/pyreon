/**
 * `bun.lock`'s FORMAT VERSION must be one the pinned bun can READ.
 *
 * bun only REWRITES the lockfile when a resolution actually changes, so a
 * contributor can run a newer bun for weeks without touching it — and then the
 * first dependency bump silently upgrades the format. CI installs with
 * `--frozen-lockfile`, so a format the pinned bun cannot read arrives as
 *
 *     error: Unknown lockfile version
 *     UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'
 *
 * at the very first step — before typecheck, before any gate that could explain
 * it, and on every job that installs. Observed on a real PR as four separate red
 * checks with one cause (#3433).
 *
 * The gate is a READABILITY question, not an equality one, and that distinction
 * is load-bearing: bun 1.4.0 WRITES version 3 but READS 1 as well, so under a
 * 1.4.0 pin a version-1 lockfile is perfectly correct and a version-3 one is
 * too. An earlier draft of this file pinned a single exact pair, which would
 * have gone RED on a lockfile CI reads without complaint — a gate that fails on
 * correct state, which is worse than no gate.
 *
 * What it still buys: a bun bump has to visit this file to declare what the new
 * version reads, which is the review moment where "can CI's bun read our
 * lockfile?" gets asked out loud rather than discovered by a queue of red checks.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Which `lockfileVersion`s each pinned bun can READ.
 *
 * Every entry is MEASURED, not read off a changelog — the provenance is in the
 * comment beside it. Adding a bun version means installing with it against a
 * lockfile of each format and recording what happened.
 */
export const BUN_LOCKFILE_SUPPORT: Record<string, readonly number[]> = {
  // Rejects 3 with `Unknown lockfile version` — observed in CI on #3433, where
  // a 1.4-written lockfile took down every job that installs.
  '1.3.14': [1],
  // Reads 1: `bun install --frozen-lockfile` succeeded on #3440's CI (which
  // pins 1.4.0) against today's version-1 lockfile. Writes 3: the lockfile on
  // #3433 was written by 1.4 and carried 3.
  '1.4.0': [1, 3],
}

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
  support: Record<string, readonly number[]> = BUN_LOCKFILE_SUPPORT,
): LockfileVerdict {
  const pinned = bunVersionFile.trim()
  const readable = support[pinned]

  if (readable === undefined) {
    const known = Object.keys(support).sort().join(', ')
    return {
      ok: false,
      error:
        `[check-lockfile-version] FAILED — .bun-version pins ${pinned}, and this gate does not know what that bun reads.\n\n` +
        `  Bumping bun changes the lockfile format it writes, and may change which\n` +
        `  formats it accepts, so the bump has to say so here.\n\n` +
        `  Install with ${pinned} against the current bun.lock, note whether it read the\n` +
        `  file and which "lockfileVersion" it wrote, then add an entry to\n` +
        `  BUN_LOCKFILE_SUPPORT in scripts/check-lockfile-version.ts with that evidence\n` +
        `  in the comment.\n\n` +
        `  Known: ${known}`,
    }
  }

  const found = readLockfileVersion(lockText)
  if (found === null) {
    return {
      ok: false,
      error:
        `[check-lockfile-version] FAILED — bun.lock declares no "lockfileVersion".\n\n` +
        `  Regenerate it with the pinned bun: bunx bun@${pinned} install`,
    }
  }

  if (!readable.includes(found)) {
    const newer = found > Math.max(...readable)
    return {
      ok: false,
      error:
        `[check-lockfile-version] FAILED — bun.lock is lockfileVersion ${found}, which the pinned bun (${pinned}) cannot read (it reads ${readable.join(' or ')}).\n\n` +
        (newer
          ? `  A newer bun regenerated it. CI installs with --frozen-lockfile and will fail at\n` +
            `  the FIRST step with "Unknown lockfile version" — on every job that installs,\n` +
            `  which reads as several unrelated red checks.\n\n`
          : `  An older bun regenerated it.\n\n`) +
        `  Usually the fix is to regenerate with the pinned version and commit the result:\n` +
        `    bunx bun@${pinned} install\n\n` +
        `  But check WHY the other bun was used first. If your change needs a feature the\n` +
        `  pin lacks — a nested override, say, which bun 1.3.14 will not apply to an\n` +
        `  entry the existing lock already satisfies — regenerating SILENTLY DROPS it and\n` +
        `  --frozen-lockfile still passes. Then the answer is to bump .bun-version (and add\n` +
        `  it to BUN_LOCKFILE_SUPPORT), not to regenerate.\n\n` +
        `  bun only rewrites the lockfile when a resolution changes, which is why a\n` +
        `  mismatched local bun can go unnoticed until the first dependency edit.`,
    }
  }

  return { ok: true, error: '' }
}

function main(): void {
  const lock = readFileSync(join(ROOT, 'bun.lock'), 'utf8')
  const pin = readFileSync(join(ROOT, '.bun-version'), 'utf8').trim()
  const verdict = checkLockfileVersion(lock, pin)
  if (!verdict.ok) {
    // eslint-disable-next-line no-console
    console.error(verdict.error)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(
    `[check-lockfile-version] bun.lock is lockfileVersion ${readLockfileVersion(lock)}, readable by the pinned bun ${pin}.`,
  )
}

// Guarded so this file can be IMPORTED to unit-test its pure helpers.
if (import.meta.main) main()
