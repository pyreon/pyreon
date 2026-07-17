/**
 * Re-pin `contrib/krausest/pyreon-keyed` to the CURRENT workspace version.
 *
 * Runs as part of `version-packages` (after `changeset version`), so the
 * krausest submission's `@pyreon/*` ranges track every release automatically
 * and the release PR carries them.
 *
 * WHY THIS EXISTS. That directory is the ready-to-submit
 * `frameworks/keyed/pyreon` implementation for the INDEPENDENT
 * krausest/js-framework-benchmark — the one artifact that can retire the
 * author-judge caveat on Pyreon's own benchmark claims. It cannot use
 * `workspace:*` (that protocol does not resolve once the directory is copied
 * into the krausest fork — it must build from published npm packages), and it
 * is not a workspace member, so `changeset version` never touches it. Combined
 * with npm's 0.x caret semantics — caret locks the MINOR, so a stale pin does
 * NOT drift forward — the artifact rots BY CONSTRUCTION.
 *
 * It sat at `^0.38.0` through ten releases. Submitting it in that state would
 * have had an independent benchmark measure and publish a Pyreon predating the
 * `remove` fast path (#2288) and the anchor-registry retained fix (#2003) —
 * scoring us worse than shipped code, permanently, under our own name.
 *
 * Deriving here (rather than hand-editing) is the same rule the scaffolders
 * follow with `PYREON_DEP_RANGE = ^${OWN_VERSION}`, and the same rule
 * `registerSingleton` follows by importing its own package.json: a version a
 * human must remember to bump is a version that goes stale.
 *
 * `krausest-pin-fresh.test.ts` gates the result.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SUBMISSION = resolve(REPO, 'contrib/krausest/pyreon-keyed/package.json')
// Any fixed-group package carries the release version; runtime-dom is the one
// the submission actually renders with.
const VERSION_SOURCE = resolve(REPO, 'packages/core/runtime-dom/package.json')

const version = (JSON.parse(readFileSync(VERSION_SOURCE, 'utf-8')) as { version: string }).version
const range = `^${version}`

const raw = readFileSync(SUBMISSION, 'utf-8')
const pkg = JSON.parse(raw) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

let changed = 0
for (const section of [pkg.dependencies, pkg.devDependencies]) {
  if (!section) continue
  for (const name of Object.keys(section)) {
    if (name.startsWith('@pyreon/') && section[name] !== range) {
      section[name] = range
      changed++
    }
  }
}

if (changed === 0) {
  console.log(`[krausest-pin] already at ${range} — no change`)
} else {
  // Preserve the file's trailing newline convention.
  writeFileSync(SUBMISSION, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`[krausest-pin] re-pinned ${changed} @pyreon/* dep(s) to ${range}`)
}
