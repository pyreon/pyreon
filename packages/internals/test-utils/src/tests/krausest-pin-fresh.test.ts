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
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')

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
