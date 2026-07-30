/**
 * `contrib/krausest/pyreon-keyed` must pin the CURRENT workspace version.
 *
 * WHY THIS GATE EXISTS. That directory is the ready-to-submit
 * `frameworks/keyed/pyreon` implementation for the independent
 * krausest/js-framework-benchmark — the one artifact that can retire the
 * author-judge caveat on every "fastest" claim Pyreon makes.
 *
 * It rots BY CONSTRUCTION: it is not a published package, so it is absent from
 * `.changeset/config.json`'s fixed group and changesets never bumps it. And
 * because npm's caret locks the MINOR for 0.x versions, a stale `^0.38.0` does
 * NOT drift forward on its own — it silently keeps resolving to 0.38.x.
 *
 * It sat at `^0.38.0` through ten releases (0.38 → 0.48). Submitting it in that
 * state would have had an INDEPENDENT benchmark measure and publish a Pyreon
 * predating (among much else) the `remove` pure-contiguous fast path (#2288) and
 * the anchor-registry retained fix (#2003) — i.e. scoring us worse than shipped
 * code, permanently, under our own name. The exact opposite of what the artifact
 * is for.
 *
 * A silent stale pin is worse than a missing artifact: it invites submitting our
 * own worst numbers while believing we are proving the opposite. So it is gated,
 * not left to whoever remembers.
 *
 * Fix when this fails: set every `@pyreon/*` dep in
 * `contrib/krausest/pyreon-keyed/package.json` to `^<workspace version>`, then
 * re-verify per its README-SUBMISSION.md (build + the 8-op real-Chromium smoke)
 * — a fresh pin that does not build is not an improvement.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')
const SUBMISSION = resolve(REPO, 'contrib/krausest/pyreon-keyed')

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>

it('the staged krausest submission pins the current workspace version', () => {
  // Any published core package carries the fixed-group version; runtime-dom is
  // the one the submission actually renders with.
  const workspaceVersion = (
    readJson(resolve(REPO, 'packages/core/runtime-dom/package.json')) as { version: string }
  ).version
  const submission = readJson(resolve(REPO, 'contrib/krausest/pyreon-keyed/package.json'))

  const deps: Record<string, string> = {
    ...(submission.dependencies as Record<string, string> | undefined),
    ...(submission.devDependencies as Record<string, string> | undefined),
  }
  const pyreonDeps = Object.entries(deps).filter(([name]) => name.startsWith('@pyreon/'))

  expect(pyreonDeps.length, 'the submission should depend on @pyreon/* packages').toBeGreaterThan(0)

  const expected = `^${workspaceVersion}`
  const stale = pyreonDeps.filter(([, range]) => range !== expected)

  expect(
    stale.map(([n, r]) => `${n}@${r}`),
    `stale pin(s) — the krausest submission would publish an OLD Pyreon as our INDEPENDENT result. Expected every @pyreon/* dep at "${expected}" (workspace ${workspaceVersion}). Re-pin, then re-verify per contrib/krausest/pyreon-keyed/README-SUBMISSION.md.`,
  ).toEqual([])
})

it('the submission uses published ranges only — never the workspace protocol', () => {
  // `workspace:*` resolves only inside this monorepo; the submission is copied
  // into the krausest fork, where it must build standalone.
  const submission = readJson(resolve(REPO, 'contrib/krausest/pyreon-keyed/package.json'))
  const deps: Record<string, string> = {
    ...(submission.dependencies as Record<string, string> | undefined),
    ...(submission.devDependencies as Record<string, string> | undefined),
  }
  const workspaceRefs = Object.entries(deps)
    .filter(([, range]) => range.startsWith('workspace:'))
    .map(([n, r]) => `${n}@${r}`)

  expect(
    workspaceRefs,
    'workspace: protocol cannot resolve inside the krausest fork — the submission must use published npm ranges',
  ).toEqual([])
})

/**
 * The two specs below extend the gate from `package.json` to the README, because
 * the README is what a human FOLLOWS when submitting — and it drifted from the
 * pin it describes for twelve minors while the package.json half stayed green.
 *
 * The lesson generalises past this file: gating a machine-readable value while
 * the prose beside it restates that value unchecked just relocates the rot.
 * Either the prose stops restating it, or the prose is gated too.
 */
it('the README does not contradict the pin it documents', () => {
  const workspaceVersion = (
    readJson(resolve(REPO, 'packages/core/runtime-dom/package.json')) as { version: string }
  ).version
  const readme = readFileSync(resolve(SUBMISSION, 'README-SUBMISSION.md'), 'utf-8')

  // Any `@pyreon/<something>@^x.y.z` the prose spells out. Historically line 9
  // read "@pyreon/*@^0.38.0" while package.json had moved to ^0.50.0 — a
  // submitter reading the README would have believed the wrong thing.
  const quoted = [...readme.matchAll(/@pyreon\/[^\s`)]*@\^?(\d+\.\d+\.\d+)/g)]
  const contradicting = quoted.map((m) => m[0]).filter((_, i) => quoted[i]![1] !== workspaceVersion)

  expect(
    contradicting,
    `README-SUBMISSION.md spells out a @pyreon/* version that is not the workspace version (${workspaceVersion}). Prose that restates package.json drifts from it — either update the text or drop the version and let package.json be the single source of truth.`,
  ).toEqual([])
})

it('the README install step matches whether a lockfile is actually committed', () => {
  const hasLockfile =
    existsSync(resolve(SUBMISSION, 'package-lock.json')) ||
    existsSync(resolve(SUBMISSION, 'npm-shrinkwrap.json'))
  const readme = readFileSync(resolve(SUBMISSION, 'README-SUBMISSION.md'), 'utf-8')

  if (hasLockfile) return // `npm ci` is correct once a lock exists; nothing to police.

  // No lock here, so `npm ci` in THIS directory hard-fails with EUSAGE ("can
  // only install with an existing package-lock.json"). The fork ROOT `npm ci`
  // is legitimate — upstream commits its own lock — so this targets only the
  // in-directory build command rather than banning the string outright.
  expect(
    readme.includes('npm ci && npm run build-prod'),
    'README-SUBMISSION.md tells the submitter to run `npm ci` in a directory with no committed lockfile — that command fails outright (EUSAGE). Use `npm install && npm run build-prod`.',
  ).toBe(false)

  expect(
    readme.includes('npm install && npm run build-prod'),
    'README-SUBMISSION.md must give a build command that actually runs: `npm install && npm run build-prod`.',
  ).toBe(true)
})
