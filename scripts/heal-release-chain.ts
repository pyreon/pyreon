/**
 * heal-release-chain — make the post-publish tag/Release/native chain
 * IDEMPOTENT and SELF-HEALING instead of gated on a fragile step outcome.
 *
 * ## The class this retires
 *
 * The 0.50.0 publish succeeded — all packages reached npm — and then ONE
 * per-package tag push died on a transient GitHub server error
 * (`remote: fatal error in commit_refs` on `@pyreon/validate@0.50.0`).
 * changesets/action pushes tags AFTER `npm publish` and sets its outputs
 * AFTER the pushes, so the step exited 1 with `outputs.published` unset,
 * and the umbrella step (`if: steps.changesets.outputs.published == 'true'`)
 * silently skipped. No `v0.50.0` tag → `release-native.yml` never fired →
 * the 7 `@pyreon/compiler-<platform>` binaries stayed at 0.48.0 while the
 * JS packages moved to 0.50.0 — every consumer silently fell back to the
 * 3.7-8.9x slower JS transform. The same shape had already eaten v0.46.0
 * and v0.49.0. Three instances = a class, per the repo rule.
 *
 * ## The design
 *
 * Decide from GROUND TRUTH, never from a prior step's outputs:
 *
 *   1. VERSION = the fixed-group version in the repo (anchor: @pyreon/core).
 *   2. Is @pyreon/core@VERSION on npm? No → nothing was published at this
 *      version (Version-PR path, or a dead release — check-published-state
 *      owns that class). Exit 0.
 *   3. Ensure the umbrella tag `vVERSION` exists ON ORIGIN, creating it at
 *      the version-BUMP commit (the oldest first-parent commit carrying
 *      VERSION — for a past version that is the `chore: version packages`
 *      merge, not whatever HEAD happens to be).
 *   4. Ensure a `release-native` run exists for the tag. A tag pushed with
 *      the default GITHUB_TOKEN does NOT trigger workflows (GitHub's
 *      recursive-trigger protection; today's push rides the checkout
 *      credential, which is RELEASE_PAT only when configured) — so if no
 *      run appears, dispatch `release-native.yml` explicitly with
 *      publish=true. Skipped when the binaries for VERSION are already on
 *      npm (a re-run must not attempt to republish).
 *   5. Ensure the GitHub Release for the tag exists.
 *   6. Best-effort: push any missing per-package `name@VERSION` tags
 *      (cosmetic — never fails the run; the umbrella tag is the
 *      load-bearing one).
 *
 * Because every step is derive-then-converge, running this on EVERY
 * Release-workflow invocation (`if: always()`) retro-heals past holes:
 * the first run on main heals v0.50.0 outright.
 *
 * Pure decision logic is exported for unit tests; the imperative shell
 * lives in main() below.
 *
 * Usage: bun scripts/heal-release-chain.ts [--dry-run]
 * Env:   GH_TOKEN (gh CLI: run lookup, dispatch, release create)
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `dirname(fileURLToPath(...))`, not Bun's `import.meta.dir` — the pure
// functions are imported by vitest under Node, where `.dir` is undefined.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ANCHOR_PKG = '@pyreon/core'
const ANCHOR_PATH = 'packages/core/core/package.json'
const NATIVE_SENTINEL = '@pyreon/compiler-darwin-arm64'
const NATIVE_WORKFLOW = 'release-native.yml'

// ── pure decision logic (unit-tested) ─────────────────────────────────────

export interface ChainState {
  /** npm has @pyreon/core@VERSION — i.e. the JS publish for VERSION happened. */
  npmHasVersion: boolean
  /** origin already has refs/tags/vVERSION. */
  originHasUmbrellaTag: boolean
  /** a release-native run exists whose head ref is the umbrella tag. */
  nativeRunExists: boolean
  /** npm already has the native binary sentinel at VERSION. */
  npmHasNativeBinaries: boolean
  /** a GitHub Release exists for the umbrella tag. */
  releaseExists: boolean
}

export type HealAction =
  | 'push-umbrella-tag'
  | 'dispatch-native'
  | 'create-release'

/**
 * What needs doing, given the observed state. Order matters: the tag must
 * exist before the dispatch (release-native checks out the tag ref) and
 * before the Release (gh release create --verify-tag).
 */
export function planHeal(state: ChainState): HealAction[] {
  if (!state.npmHasVersion) return []
  const actions: HealAction[] = []
  if (!state.originHasUmbrellaTag) actions.push('push-umbrella-tag')
  // Dispatch only when BOTH signals say the native side never happened:
  // no run for the tag AND no binaries on npm. Either alone is ambiguous —
  // a run may exist but have failed (visible red, owner: that run), and
  // binaries-without-a-run means a manual bootstrap already covered it.
  if (!state.nativeRunExists && !state.npmHasNativeBinaries) {
    actions.push('dispatch-native')
  }
  if (!state.releaseExists) actions.push('create-release')
  return actions
}

/**
 * The tag target for VERSION: the OLDEST first-parent commit whose anchor
 * package.json carries VERSION — i.e. the version-bump merge itself. Healing
 * a PAST version must not tag whatever HEAD happens to be.
 *
 * `shas` is newest-first (git log order); `versionAt` maps sha → the anchor
 * version at that commit. Returns null when no commit carries VERSION (the
 * caller then falls back to HEAD — the fresh-publish path, where HEAD IS the
 * bump commit but the log window may not include it, e.g. shallow history).
 */
export function resolveBumpCommit(
  shas: readonly string[],
  versionAt: (sha: string) => string | null,
  version: string,
): string | null {
  let candidate: string | null = null
  for (const sha of shas) {
    const v = versionAt(sha)
    if (v === version) {
      candidate = sha // keep walking — we want the OLDEST match
    } else if (candidate !== null) {
      break // left the VERSION window; candidate is the bump commit
    }
  }
  return candidate
}

// ── imperative shell ──────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run')

// node:child_process, not `Bun.spawnSync` — this file is imported by vitest
// under Node for the pure functions, and a Bun global at module scope (or in
// a hoisted function body the type-checker walks) breaks that. Same
// convention as every other test-imported script here.
function sh(cmd: string[], opts: { allowFail?: boolean } = {}): { ok: boolean; out: string } {
  const r = spawnSync(cmd[0]!, cmd.slice(1), { cwd: REPO_ROOT, encoding: 'utf-8' })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`[heal-release-chain] command failed: ${cmd.join(' ')}\n${out}`)
    process.exit(1)
  }
  return { ok: r.status === 0, out }
}

/** Retry a push a few times — the whole class started with ONE transient failure. */
async function pushWithRetry(refs: string[], attempts = 3): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    const r = sh(['git', 'push', 'origin', ...refs], { allowFail: true })
    if (r.ok) return true
    console.warn(`[heal-release-chain] push attempt ${i}/${attempts} failed:\n${r.out}`)
    if (i < attempts) await new Promise((res) => setTimeout(res, 2000 * i))
  }
  return false
}

async function npmVersionExists(pkg: string, version: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/${version}`)
    if (res.status === 200) return true
    if (res.status === 404) return false
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.error(`[heal-release-chain] registry unreachable for ${pkg}@${version} — refusing to guess`)
  process.exit(2)
}

async function main(): Promise<void> {
  const version = (
    JSON.parse(readFileSync(join(REPO_ROOT, ANCHOR_PATH), 'utf-8')) as { version: string }
  ).version
  const tag = `v${version}`
  console.log(`[heal-release-chain] anchor ${ANCHOR_PKG}@${version} → umbrella tag ${tag}`)

  // 1. Ground truth: was VERSION published?
  if (!(await npmVersionExists(ANCHOR_PKG, version))) {
    console.log(
      `[heal-release-chain] ${ANCHOR_PKG}@${version} is not on npm — nothing published at this version (Version-PR path or dead release; check-published-state owns the dead-release alarm). Nothing to heal.`,
    )
    return
  }

  // 2. Observe the rest of the chain.
  const originHasUmbrellaTag = sh(
    ['git', 'ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`],
    { allowFail: true },
  ).ok
  const runList = sh(
    ['gh', 'run', 'list', '--workflow', NATIVE_WORKFLOW, '--branch', tag, '--limit', '1', '--json', 'databaseId'],
    { allowFail: true },
  )
  const nativeRunExists = runList.ok && runList.out.includes('databaseId')
  const npmHasNativeBinaries = await npmVersionExists(NATIVE_SENTINEL, version)
  const releaseExists = sh(['gh', 'release', 'view', tag, '--json', 'tagName'], {
    allowFail: true,
  }).ok

  const state: ChainState = {
    npmHasVersion: true,
    originHasUmbrellaTag,
    nativeRunExists,
    npmHasNativeBinaries,
    releaseExists,
  }
  const actions = planHeal(state)
  console.log(`[heal-release-chain] state: ${JSON.stringify(state)}`)
  console.log(`[heal-release-chain] plan: ${actions.length === 0 ? '(healthy — nothing to do)' : actions.join(' → ')}`)
  if (dryRun || actions.length === 0) return

  for (const action of actions) {
    if (action === 'push-umbrella-tag') {
      // Tag the version-BUMP commit, not HEAD — this may be healing a past
      // version long after newer commits landed.
      const log = sh(['git', 'log', '--first-parent', '--format=%H', '-n', '400', 'origin/main'])
      const shas = log.out.split('\n').filter(Boolean)
      const target =
        resolveBumpCommit(
          shas,
          (sha) => {
            const show = sh(['git', 'show', `${sha}:${ANCHOR_PATH}`], { allowFail: true })
            if (!show.ok) return null
            try {
              return (JSON.parse(show.out) as { version: string }).version
            } catch {
              return null
            }
          },
          version,
        ) ?? 'HEAD'
      console.log(`[heal-release-chain] creating ${tag} at ${target}`)
      sh(['git', 'tag', '--force', tag, target])
      if (!(await pushWithRetry([tag]))) {
        console.error(`[heal-release-chain] FAILED to push ${tag} after retries`)
        process.exit(1)
      }
    } else if (action === 'dispatch-native') {
      // A tag pushed with the default GITHUB_TOKEN does not trigger
      // workflows, so give the tag-push trigger a moment and then check
      // again before dispatching — release-native's per-ref concurrency
      // group would dedupe a double-fire, but a second PUBLISHING run
      // after the first finished would die republished; don't create it.
      await new Promise((r) => setTimeout(r, 20_000))
      const again = sh(
        ['gh', 'run', 'list', '--workflow', NATIVE_WORKFLOW, '--branch', tag, '--limit', '1', '--json', 'databaseId'],
        { allowFail: true },
      )
      if (again.ok && again.out.includes('databaseId')) {
        console.log(`[heal-release-chain] tag push triggered ${NATIVE_WORKFLOW} on its own — no dispatch needed`)
        continue
      }
      console.log(`[heal-release-chain] dispatching ${NATIVE_WORKFLOW} for ${tag} (publish=true)`)
      const d = sh(
        ['gh', 'workflow', 'run', NATIVE_WORKFLOW, '--ref', tag, '-f', `ref=${tag}`, '-f', 'publish=true'],
        { allowFail: true },
      )
      if (!d.ok) {
        // Needs `actions: write` — fail LOUDLY, a silent skip here is the
        // exact invisibility this script exists to end.
        console.error(`[heal-release-chain] dispatch failed (missing actions:write?):\n${d.out}`)
        process.exit(1)
      }
    } else if (action === 'create-release') {
      const notes = [
        `All packages in the \`@pyreon/*\` suite at **${version}**.`,
        '',
        'Per-package detail: see each `packages/*/CHANGELOG.md` for the entry generated from the changesets that bumped it.',
      ].join('\n')
      const r = sh(
        ['gh', 'release', 'create', tag, '--title', tag, '--notes', notes, '--verify-tag'],
        { allowFail: true },
      )
      if (!r.ok) console.warn(`[heal-release-chain] release create: ${r.out} (already exists?)`)
    }
  }

  // 3. Best-effort per-package tag heal — cosmetic, never fails the run.
  //    The 0.50.0 incident left every tag after @pyreon/validate unpushed.
  const remote = sh(['git', 'ls-remote', '--tags', 'origin'], { allowFail: true })
  if (remote.ok) {
    const onOrigin = new Set(
      remote.out
        .split('\n')
        .map((l) => l.split('refs/tags/')[1])
        .filter(Boolean),
    )
    const local = sh(['git', 'tag', '-l', `@pyreon/*@${version}`]).out.split('\n').filter(Boolean)
    const missing = local.filter((t) => !onOrigin.has(t))
    if (missing.length > 0) {
      console.log(`[heal-release-chain] pushing ${missing.length} missing per-package tag(s)`)
      if (!(await pushWithRetry(missing.map((t) => `refs/tags/${t}`)))) {
        console.warn('[heal-release-chain] per-package tag push failed after retries — cosmetic, continuing')
      }
    }
  }

  console.log('[heal-release-chain] done')
}

if (import.meta.main) {
  await main()
}
