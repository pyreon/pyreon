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
 *
 * The ONE exception is a major the maintainer approved in
 * `scripts/major-release.ts` (the 0.x → 1.0.0 cut): while the fixed group's
 * current version may move to `APPROVED_MAJOR`, nothing is capped — otherwise
 * this step would silently turn the deliberate 1.0.0 changeset into a minor
 * at release time, after every PR-time gate had accepted it.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APPROVED_MAJOR, majorReleaseAllowed, readFixedGroupVersion } from './major-release'

const ROOT = join(import.meta.dirname, '..')
const CHANGESET_DIR = join(ROOT, '.changeset')

// Match `'@pyreon/X': major` (and the unquoted form) on a FRONTMATTER line.
// Group 1 = the package + colon segment, kept verbatim; we just swap the
// trailing severity word.
const MAJOR_LINE = /^(\s*['"]?[^:'"]+['"]?\s*:\s*)major\s*$/gm

/**
 * Cap severities in the YAML frontmatter ONLY. The line regex matches English
 * too (`Impact: major`, `Breaking-change risk: major`), and a changeset BODY is
 * copied verbatim into `CHANGELOG.md` — running it over the whole file shipped
 * the OPPOSITE of what the author wrote into the published changelog. The
 * structure is explicit (`---` fences), so read it instead of inferring it
 * from line shape. A file without a frontmatter block is returned unchanged.
 */
export function capChangesetText(text: string): string {
  // The opening fence is CAPTURED (`---\n` or `---\r\n`) and its length used
  // for the splice — a hardcoded 4 was right for LF and, under CRLF, dropped
  // the fence's newline and duplicated a byte, leaving unparseable frontmatter.
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(text)
  if (!m) return text
  const fence = m[1]!
  const front = m[2]!
  const capped = front.replace(MAJOR_LINE, '$1minor')
  if (capped === front) return text
  return fence + capped + text.slice(fence.length + front.length)
}

/** Cap unless the maintainer approved the major the group is about to take. */
export function shouldCapMajors(currentVersion: string, approved: string | null = APPROVED_MAJOR): boolean {
  return !majorReleaseAllowed(currentVersion, approved)
}

const capping = import.meta.main && shouldCapMajors(readFixedGroupVersion(ROOT))
if (import.meta.main && !capping) {
  // oxlint-disable-next-line no-console
  console.log(
    `[cap-bumps] major release ${APPROVED_MAJOR} is approved in scripts/major-release.ts (group at ${readFixedGroupVersion(ROOT)}) — leaving \`major\` changesets as written`,
  )
}
const files = capping
  ? readdirSync(CHANGESET_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
  : []

let touched = 0
for (const f of files) {
  const path = join(CHANGESET_DIR, f)
  const before = readFileSync(path, 'utf8')
  const after = capChangesetText(before)
  if (before !== after) {
    writeFileSync(path, after)
    // oxlint-disable-next-line no-console
    console.log(`[cap-bumps] downgraded major → minor in ${f}`)
    touched += 1
  }
}

if (capping) {
  if (touched > 0) {
    // oxlint-disable-next-line no-console
    console.log(`[cap-bumps] capped ${touched} changeset(s) at minor (0.x policy)`)
  } else {
    // oxlint-disable-next-line no-console
    console.log('[cap-bumps] no major bumps to cap — clean')
  }
}
