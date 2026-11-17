/**
 * CI guard: fail if any `.changeset/*.md` declares a `major` bump that the
 * maintainer has not approved.
 *
 * A `major` changeset moves the whole fixed `@pyreon/*` group to the next
 * major. That is allowed in exactly one shape: `scripts/major-release.ts`
 * names that next major in `APPROVED_MAJOR` (the 0.x → 1.0.0 cut sets it to
 * `'1.0.0'`). Every other `major` fails here, at PR time, with the fix.
 *
 * While Pyreon is 0.x, a breaking change is written as `minor` with the break
 * described in the prose. Companion to `scripts/cap-changeset-bumps.ts`
 * (release time) and `scripts/cap-version-bumps.ts` (after versioning), which
 * read the same switch.
 *
 * Wired into `.github/workflows/ci.yml` as a fast standalone job, and into
 * `validate-fast`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APPROVED_MAJOR, majorReleaseAllowed, readFixedGroupVersion } from './major-release'

const ROOT = join(import.meta.dirname, '..')
const CHANGESET_DIR = join(ROOT, '.changeset')
const MAJOR_LINE = /^(\s*['"]?[^:'"]+['"]?\s*:\s*)major\s*$/m

/** `file: line` for every changeset whose FRONTMATTER declares `major`. */
export function majorOffenders(files: ReadonlyArray<{ name: string; text: string }>): string[] {
  const out: string[] = []
  for (const { name, text } of files) {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
    const match = front?.match(MAJOR_LINE)
    if (match) out.push(`${name}: ${match[0].trim()}`)
  }
  return out
}

export interface NoMajorVerdict {
  ok: boolean
  offenders: string[]
  /** Set when majors are present and approved. */
  approvedTarget?: string
}

export function checkNoMajor(
  files: ReadonlyArray<{ name: string; text: string }>,
  currentVersion: string,
  approved: string | null = APPROVED_MAJOR,
): NoMajorVerdict {
  const offenders = majorOffenders(files)
  if (offenders.length === 0) return { ok: true, offenders }
  if (majorReleaseAllowed(currentVersion, approved)) return { ok: true, offenders, approvedTarget: approved! }
  return { ok: false, offenders }
}

if (import.meta.main) {
  // oxlint-disable no-console
  if (!existsSync(CHANGESET_DIR)) {
    console.log('[check-no-major] no .changeset/ dir — skip')
    process.exit(0)
  }
  const files = readdirSync(CHANGESET_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((name) => ({ name, text: readFileSync(join(CHANGESET_DIR, name), 'utf8') }))
  const current = readFixedGroupVersion(ROOT)
  const verdict = checkNoMajor(files, current)

  if (verdict.ok && verdict.approvedTarget) {
    console.log(
      `[check-no-major] OK — ${verdict.offenders.length} major changeset(s) take the group from ${current} to the approved ${verdict.approvedTarget} (scripts/major-release.ts):`,
    )
    for (const line of verdict.offenders) console.log(`  - ${line}`)
    process.exit(0)
  }
  if (verdict.ok) {
    console.log('[check-no-major] OK — no major bumps in changesets')
    process.exit(0)
  }

  console.error(
    `[check-no-major] FAILED — a \`major\` changeset would move every @pyreon/* package from ${current} to the next major, and no such release is approved`,
  )
  console.error('')
  console.error('Offending changesets:')
  for (const line of verdict.offenders) console.error(`  - ${line}`)
  console.error('')
  if (current.startsWith('0.')) {
    console.error('Fix: Pyreon is 0.x, so a breaking change is `minor`. Change the severity in the')
    console.error('     frontmatter and describe the break in the prose.')
  } else {
    console.error('Fix: a major release of the fixed group is the maintainer\'s decision. Use `minor` or')
    console.error('     `patch` unless the maintainer has approved the major.')
  }
  console.error('     The major release itself is cut by setting APPROVED_MAJOR in scripts/major-release.ts')
  console.error('     (see "Major release" in .agents/guides/ci/README.md).')
  // oxlint-enable no-console
  process.exit(1)
}
