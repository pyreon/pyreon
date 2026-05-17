/**
 * Pre-version hook: rewrite any `: major` severity in `.changeset/*.md` to
 * `: minor` before `changeset version` runs.
 *
 * Pyreon is a 0.x project; under semver, a `major` changeset on a 0.x
 * package bumps it to 1.0.0 — but Pyreon explicitly does not consider
 * itself 1.0-ready. This script caps every changeset severity at minor so
 * a stray `major` (intentional or accidental) can't trigger a 1.0.0
 * cascade across the `fixed` group of 60+ packages.
 *
 * Runs in `.github/workflows/release.yml` BEFORE the `changesets/action`
 * step. Companion guard `scripts/check-no-major-changesets.ts` runs in CI
 * to catch `: major` at PR time so contributors get a clear error instead
 * of a silent downgrade.
 *
 * The downgrade is idempotent: if no `: major` lines exist, the script is
 * a no-op and exits 0.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHANGESET_DIR = join(import.meta.dirname, '..', '.changeset')

// Match `'@pyreon/X': major` (and the unquoted form) anywhere on a line.
// Group 1 = the package + colon segment, kept verbatim; we just swap the
// trailing severity word.
const MAJOR_LINE = /^(\s*['"]?[^:'"]+['"]?\s*:\s*)major\s*$/gm

const files = readdirSync(CHANGESET_DIR).filter(
  (f) => f.endsWith('.md') && f !== 'README.md',
)

let touched = 0
for (const f of files) {
  const path = join(CHANGESET_DIR, f)
  const before = readFileSync(path, 'utf8')
  const after = before.replace(MAJOR_LINE, '$1minor')
  if (before !== after) {
    writeFileSync(path, after)
    // oxlint-disable-next-line no-console
    console.log(`[cap-bumps] downgraded major → minor in ${f}`)
    touched += 1
  }
}

if (touched > 0) {
  // oxlint-disable-next-line no-console
  console.log(
    `[cap-bumps] capped ${touched} changeset(s) at minor (0.x policy)`,
  )
} else {
  // oxlint-disable-next-line no-console
  console.log('[cap-bumps] no major bumps to cap — clean')
}
