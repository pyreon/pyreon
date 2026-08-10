/**
 * heal-release-chain — complete the post-publish chain (umbrella tag, GitHub
 * Release, native-binary build) from TRUSTWORTHY signals, idempotently.
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
 * ## The design — two layers, each with the RIGHT source of truth
 *
 * PHASE 1 — this run, LOCAL truth. `publish.ts` writes `publish-result.json`
 * the moment publishing finishes — before any tag push can fail — so "did
 * THIS run publish?" is answered by our own process, with no network and no
 * third-party step outputs in the loop. The tag target is simply HEAD: the
 * publishing run's checkout IS the version commit. This is the normal path
 * and it never connects anywhere except origin (the pushes themselves).
 *
 * PHASE 2 — standing state, REMOTE truth. Whether a PREVIOUS run's publish
 * landed has no local source — that gap is the dead-release class — so the
 * reconciler asks npm (the same registry this workflow already talks to for
 * publishing and `check-published-state`), and heals any hole it finds:
 * tag at the version-BUMP commit (the oldest first-parent commit carrying
 * VERSION — never HEAD, this may run long after), missing native run →
 * explicit dispatch, missing GitHub Release → create. Running phase 2 on
 * every Release invocation is what retro-heals v0.50.0. Right after phase 1
 * it no-ops (everything exists), and registry replication lag cannot bite:
 * phase 1 already completed the fresh release without npm's help.
 *
 * A tag pushed with the default GITHUB_TOKEN does NOT trigger workflows
 * (recursive-trigger protection; the push rides the checkout credential,
 * which is RELEASE_PAT only when configured) — so after pushing, both phases
 * verify a release-native run exists for the tag and dispatch
 * `release-native.yml` explicitly when it does not. Never re-dispatched when
 * a run exists (even a failed one — that is visible and owned) or when the
 * binaries are already on npm (a manual bootstrap covered it).
 *
 * Pure decision logic is exported for unit tests; the imperative shell
 * lives in main() below.
 *
 * Usage: bun scripts/heal-release-chain.ts [--dry-run]
 * Env:   GH_TOKEN (gh CLI: run lookup, dispatch, release create)
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

/**
 * Strict semver gate for the anchor version. The version string is FILE data
 * (package.json) that flows into a registry URL, git tag names, and gh CLI
 * argv — so it is validated at the read boundary and the MATCH RESULT is what
 * flows onward, never the raw string (CodeQL js/file-access-to-http, and the
 * same validation kills the `--flag`-shaped-argv class for the git/gh calls).
 * Returns null for anything that is not a plain release version.
 */
export function validateReleaseVersion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(raw)
  return m ? m[1]! : null
}

/**
 * Parse + validate `publish-result.json` (phase 1's local truth). Returns null
 * whenever there is nothing sound to finalize — absent/malformed file, no
 * packages published, or a version that fails the semver gate. A malformed
 * manifest must degrade to "phase 2 will reconcile", never crash the
 * always() step or tag garbage.
 */
export function parsePublishResult(
  text: string | null,
): { version: string; published: string[] } | null {
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const obj = raw as { version?: unknown; published?: unknown }
  const version = validateReleaseVersion(obj.version)
  if (version === null) return null
  if (!Array.isArray(obj.published) || obj.published.length === 0) return null
  if (!obj.published.every((p) => typeof p === 'string')) return null
  return { version, published: obj.published }
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
  // The request URL is a CONSTANT per package: `pkg` is always one of the
  // hardcoded sentinels (ANCHOR_PKG / NATIVE_SENTINEL), and the version — the
  // one piece of FILE data (package.json) — never enters the request at all.
  // It is only a KEY into the response (abbreviated packument), so no repo
  // data flows outbound (CodeQL js/file-access-to-http). The remote lookup
  // itself is the point of this script: "did the publish reach npm?" has no
  // local source of truth — that gap IS the dead-release class — and this
  // workflow already talks to registry.npmjs.org (the publish itself +
  // check-published-state).
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      // Abbreviated packument — versions map without READMEs/attachments.
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    })
    if (res.status === 404) return false // package has never been published
    if (res.ok) {
      const doc = (await res.json()) as { versions?: Record<string, unknown> }
      // Object.hasOwn, not `in`/index — belt on top of the semver gate so a
      // key like `__proto__` could never false-positive.
      return Object.hasOwn(doc.versions ?? {}, version)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.error(`[heal-release-chain] registry unreachable for ${pkg}@${version} — refusing to guess`)
  process.exit(2)
}

// ─── chain operations (shared by both phases) ─────────────────────────────

async function ensureUmbrellaTag(tag: string, target: string): Promise<void> {
  console.log(`[heal-release-chain] creating ${tag} at ${target}`)
  sh(['git', 'tag', '--force', tag, target])
  if (!(await pushWithRetry([tag]))) {
    console.error(`[heal-release-chain] FAILED to push ${tag} after retries`)
    process.exit(1)
  }
}

/**
 * Make sure a release-native run exists for the tag. The tag push rides the
 * checkout credential — RELEASE_PAT triggers the workflow, the default
 * GITHUB_TOKEN does not (recursive-trigger protection) — so wait briefly for
 * the push-triggered run and dispatch explicitly only when none appears.
 * Never double-fires: a second PUBLISHING run after the first would die
 * republishing the same versions.
 */
async function ensureNativeRun(tag: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 20_000))
  const again = sh(
    ['gh', 'run', 'list', '--workflow', NATIVE_WORKFLOW, '--branch', tag, '--limit', '1', '--json', 'databaseId'],
    { allowFail: true },
  )
  if (again.ok && again.out.includes('databaseId')) {
    console.log(`[heal-release-chain] tag push triggered ${NATIVE_WORKFLOW} on its own — no dispatch needed`)
    return
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
}

function createGithubRelease(tag: string, version: string): void {
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

/** Push local per-package tags origin lacks — cosmetic, never fails the run. */
async function pushMissingPerPkgTags(version: string): Promise<void> {
  const remote = sh(['git', 'ls-remote', '--tags', 'origin'], { allowFail: true })
  if (!remote.ok) return
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

function observeChain(tag: string): {
  originHasUmbrellaTag: boolean
  nativeRunExists: boolean
  releaseExists: boolean
} {
  const originHasUmbrellaTag = sh(
    ['git', 'ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`],
    { allowFail: true },
  ).ok
  const runList = sh(
    ['gh', 'run', 'list', '--workflow', NATIVE_WORKFLOW, '--branch', tag, '--limit', '1', '--json', 'databaseId'],
    { allowFail: true },
  )
  const nativeRunExists = runList.ok && runList.out.includes('databaseId')
  const releaseExists = sh(['gh', 'release', 'view', tag, '--json', 'tagName'], {
    allowFail: true,
  }).ok
  return { originHasUmbrellaTag, nativeRunExists, releaseExists }
}

// ─── Phase 1 — THIS run, local truth (publish-result.json) ────────────────

async function finalizeCurrentRun(): Promise<void> {
  const manifestPath = join(REPO_ROOT, 'publish-result.json')
  const text = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : null
  const result = parsePublishResult(text)
  if (result === null) {
    console.log(
      '[heal-release-chain] phase 1: no valid publish-result.json — nothing published in THIS run (Version-PR path). Phase 2 reconciles standing state.',
    )
    return
  }
  const tag = `v${result.version}`
  console.log(
    `[heal-release-chain] phase 1: this run published ${result.published.length} package(s) at ${result.version} → completing chain for ${tag}`,
  )
  if (dryRun) {
    console.log('[heal-release-chain] phase 1 (dry-run): would tag HEAD, create Release, ensure native run')
    return
  }
  const obs = observeChain(tag)
  // HEAD is the version commit — this checkout IS the run that published.
  if (!obs.originHasUmbrellaTag) await ensureUmbrellaTag(tag, 'HEAD')
  if (!obs.releaseExists) createGithubRelease(tag, result.version)
  // Fresh publish: the binaries CANNOT be on npm yet (they build from this
  // tag), so the only question is whether a run exists (retry-run case).
  if (!obs.nativeRunExists) await ensureNativeRun(tag)
  await pushMissingPerPkgTags(result.version)
  console.log('[heal-release-chain] phase 1 done')
}

// ─── Phase 2 — standing state, remote truth (npm reconcile) ───────────────

async function reconcile(): Promise<void> {
  const version = validateReleaseVersion(
    (JSON.parse(readFileSync(join(REPO_ROOT, ANCHOR_PATH), 'utf-8')) as { version: string })
      .version,
  )
  if (version === null) {
    console.error(
      `[heal-release-chain] ${ANCHOR_PATH} carries a non-semver version — refusing to build tags from it`,
    )
    process.exit(1)
  }
  const tag = `v${version}`
  console.log(`[heal-release-chain] phase 2: anchor ${ANCHOR_PKG}@${version} → umbrella tag ${tag}`)

  if (!(await npmVersionExists(ANCHOR_PKG, version))) {
    console.log(
      `[heal-release-chain] ${ANCHOR_PKG}@${version} is not on npm — nothing RELEASED at this version (Version-PR path, a dead release — check-published-state owns that alarm — or a just-finished publish the registry has not replicated; phase 1 owns that case). Nothing to reconcile.`,
    )
    return
  }

  const obs = observeChain(tag)
  const state: ChainState = {
    npmHasVersion: true,
    ...obs,
    npmHasNativeBinaries: await npmVersionExists(NATIVE_SENTINEL, version),
  }
  const actions = planHeal(state)
  console.log(`[heal-release-chain] state: ${JSON.stringify(state)}`)
  console.log(`[heal-release-chain] plan: ${actions.length === 0 ? '(healthy — nothing to do)' : actions.join(' → ')}`)
  if (dryRun || actions.length === 0) return

  for (const action of actions) {
    if (action === 'push-umbrella-tag') {
      // Tag the version-BUMP commit, not HEAD — reconcile may run long after
      // newer commits landed on top of the version it is healing.
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
      await ensureUmbrellaTag(tag, target)
    } else if (action === 'dispatch-native') {
      await ensureNativeRun(tag)
    } else if (action === 'create-release') {
      createGithubRelease(tag, version)
    }
  }

  await pushMissingPerPkgTags(version)
  console.log('[heal-release-chain] phase 2 done')
}

if (import.meta.main) {
  await finalizeCurrentRun()
  await reconcile()
}
