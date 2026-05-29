/**
 * CI guard: fail if any `.changeset/*.md` contains a `: major` severity.
 *
 * Pyreon is 0.x. Companion to `scripts/cap-changeset-bumps.ts` (which
 * downgrades major → minor at release time) — this script catches the
 * shape at PR time so contributors see a clear error instead of a silent
 * downgrade when they intended a real breaking change.
 *
 * The right path for a breaking change in 0.x is:
 *   1. Mark the changeset `minor` (correct semver under 0.x)
 *   2. Write the prose to clearly call out the breaking change
 *   3. Don't bump to 1.0.0 — Pyreon is not 1.0-ready
 *
 * When 1.0.0 IS intended (someday), remove BOTH this guard and
 * `cap-changeset-bumps.ts` AS A DELIBERATE GATE — a single PR removing
 * the cap is the explicit signal "we're going 1.0 now."
 *
 * Wired into `.github/workflows/ci.yml` as a fast standalone job.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CHANGESET_DIR = join(import.meta.dirname, '..', '.changeset')
const MAJOR_LINE = /^(\s*['"]?[^:'"]+['"]?\s*:\s*)major\s*$/m

if (!existsSync(CHANGESET_DIR)) {
  // oxlint-disable-next-line no-console
  console.log('[check-no-major] no .changeset/ dir — skip')
  process.exit(0)
}

const offenders: string[] = []
const files = readdirSync(CHANGESET_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')

for (const f of files) {
  const body = readFileSync(join(CHANGESET_DIR, f), 'utf8')
  const match = body.match(MAJOR_LINE)
  if (match) offenders.push(`${f}: ${match[0].trim()}`)
}

if (offenders.length === 0) {
  // oxlint-disable-next-line no-console
  console.log('[check-no-major] OK — no major bumps in changesets')
  process.exit(0)
}

// oxlint-disable no-console
console.error('[check-no-major] FAILED — Pyreon is 0.x; `major` bumps are not allowed')
console.error('')
console.error('Offending changesets:')
for (const line of offenders) console.error(`  - ${line}`)
console.error('')
console.error('Fix: change the severity to `minor` in the changeset frontmatter.')
console.error('     Use prose to call out the breaking change clearly.')
console.error('     When Pyreon goes 1.0 someday, remove this guard in a deliberate PR.')
// oxlint-enable no-console
process.exit(1)
