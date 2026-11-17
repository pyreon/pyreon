/**
 * The maintainer's switch for a MAJOR release of the fixed `@pyreon/*` group.
 *
 * Every `major` path is closed unless this names the exact major version the
 * maintainer has approved. Three gates read it:
 *   - `check-no-major-changesets.ts` (CI + validate-fast) — PR time
 *   - `cap-changeset-bumps.ts` (release.yml, before `changeset version`)
 *   - `cap-version-bumps.ts` (inside `version-packages`, after it)
 *
 * Setting it is the reviewed signal "we are cutting this major now". It is
 * changed in its own PR, together with `bun changeset pre enter rc` and the
 * one `major` changeset — see the Release runbook in
 * `.agents/guides/ci/README.md`.
 *
 * The approval covers ONE transition: from the major below it, and from its
 * own release candidates (a `major` changeset merged during the rc series
 * still lands in the same `N.0.0`). Once the approved version itself is the
 * current stable version, the switch is inert: a further `major` would
 * produce the next major, which it does not name.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSemver } from './release-channel'

/**
 * `null` = no major release is approved. Set to `'1.0.0'` to permit the
 * 0.x → 1.0.0 transition.
 */
export const APPROVED_MAJOR: string | null = null

/** The fixed group's current version, read from the anchor package every release script uses. */
export function readFixedGroupVersion(root: string): string {
  return (JSON.parse(readFileSync(join(root, 'packages', 'core', 'core', 'package.json'), 'utf8')) as { version: string }).version
}

/**
 * May a `major` changeset take the fixed group from `current` to `approved`?
 * True only when `approved` is `N.0.0` and either `current` is a version of
 * major N-1 (including its prereleases), or `current` is a prerelease of
 * `N.0.0` itself (the release-candidate series).
 */
export function majorReleaseAllowed(current: string, approved: string | null = APPROVED_MAJOR): boolean {
  if (approved === null) return false
  const t = parseSemver(approved)
  const c = parseSemver(current)
  if (!t || !c || t.minor !== 0 || t.patch !== 0 || t.pre.length > 0) return false
  if (t.major === c.major + 1) return true
  return c.pre.length > 0 && c.major === t.major && c.minor === 0 && c.patch === 0
}

/**
 * What `cap-version-bumps.ts` does with a package that `changeset version`
 * moved from `oldVersion` (git HEAD~) to `newVersion`:
 *   - `none`     — not a 0.x → 1.0.0 move (e.g. `1.0.0-rc.3 → 1.0.0` on pre exit)
 *   - `approved` — the maintainer approved this major; leave it
 *   - `cap`      — the stable peer-cascade 1.0.0; rewrite to the next minor
 *   - `refuse`   — an unapproved 0.x → 1.0.0-<pre>; fail the version step
 * An unknown `oldVersion` (file absent at HEAD~) keeps the historical path
 * for `1.0.0` (cap, which warns and skips) and refuses a prerelease.
 */
export function classifyOneZeroMove(
  newVersion: string,
  oldVersion: string | null,
  approved: string | null = APPROVED_MAJOR,
): 'none' | 'approved' | 'cap' | 'refuse' {
  if (newVersion !== '1.0.0' && !newVersion.startsWith('1.0.0-')) return 'none'
  if (oldVersion !== null && !oldVersion.startsWith('0.')) return 'none'
  if (oldVersion !== null && majorReleaseAllowed(oldVersion, approved)) return 'approved'
  return newVersion === '1.0.0' ? 'cap' : 'refuse'
}
