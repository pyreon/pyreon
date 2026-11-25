#!/usr/bin/env bun
/**
 * diff-base — the ONE definition of "what this CI run changed".
 *
 * Every workflow step that selects work from the diff (the affected-package
 * matrices, coverage of changed packages, the e2e / scaffold / doc-example
 * relevance checks, the changeset and diagnose-catalog gates, the size and
 * site-budget bases, the advisory audit, the native-lane decides) reads its
 * base from here, so they cannot disagree on WHICH commit the run is compared
 * against.
 *
 * ## The rule, per event
 *
 * - `pull_request`: the job runs on GitHub's test-merge commit
 *   (`refs/pull/N/merge`, pinned to `GITHUB_SHA`). The base is that commit's
 *   FIRST PARENT — the commit of the base branch GitHub actually built the
 *   merge on. The changed set is the tree diff `first-parent → merge commit`,
 *   which equals the three-dot diff of the head branch against its true merge
 *   base with that commit.
 *
 *   NOT the event's `pull_request.base.sha`. That value is the base-branch tip
 *   when the event fired; GitHub can build the merge ref on a NEWER base. A
 *   diff from `base.sha` across the merge ref then contains every commit that
 *   landed on main in between, and the run blames the PR for them (2026-11-24,
 *   #4776: a benchmark-only PR failed `Build` on `@pyreon/test-utils` coverage
 *   because main's #4780 had touched a file mapped to test-utils).
 * - `merge_group`: the event's `merge_group.base_sha`, the commit the queue
 *   built the group on.
 * - `push`: the event's `before`, the branch tip the push replaced. A push
 *   that created the branch has no `before` and is refused.
 * - any other event (`workflow_dispatch`, `schedule`, …): refused. There is no
 *   change set to select from; such a run is a full run, decided by the caller.
 * - outside GitHub Actions (a local run): `merge-base(origin/main, HEAD)`.
 *
 * Every failure THROWS a `[Pyreon]` error that says how to fix it. A shallow
 * checkout that lacks the base commit is the main case: answering "everything"
 * or "nothing" there is how a wrong selection ships silently. A caller that
 * wants to fail closed does so explicitly, after the error is printed.
 *
 * ## Checkout depth
 *
 * `pull_request` needs the merge commit's parents: `fetch-depth: 2` (or 0).
 * `merge_group` / `push` need their base commit: `fetch-depth: 0`, or an
 * explicit `git fetch --depth=1 origin <sha>` before calling this.
 *
 * ## CLI
 *
 *   bun scripts/diff-base.ts                 # print the base sha
 *   bun scripts/diff-base.ts --files         # print the changed files, one per line
 *   bun scripts/diff-base.ts --github-env    # append CI_BASE=<sha> to $GITHUB_ENV
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

import { gitChangedFilesZ } from './changed-files'

export interface DiffBase {
  /** The base commit (full sha). */
  base: string
  /** The commit the run compares (full sha of HEAD). */
  head: string
  /** One line saying which rule chose the base — printed into CI logs. */
  rule: string
}

export interface DiffBaseOptions {
  cwd?: string
  /** Defaults to `process.env`. Only `GITHUB_*` keys are read. */
  env?: NodeJS.ProcessEnv
  /** The ref a local run measures against. Default `origin/main`. */
  localBase?: string
}

const SHA = /^[0-9a-f]{40}$/

function fail(message: string): never {
  throw new Error(`[Pyreon] diff base: ${message}`)
}

function gitIn(cwd: string | undefined) {
  // A hook or a parent git process can export GIT_DIR / GIT_INDEX_FILE; they
  // would point these reads at another repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  return (...args: string[]): string =>
    execFileSync('git', args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
}

type Git = ReturnType<typeof gitIn>

function hasCommit(git: Git, sha: string): boolean {
  try {
    git('cat-file', '-e', `${sha}^{commit}`)
    return true
  } catch {
    return false
  }
}

/**
 * The parents RECORDED in a commit object. Read from the raw object rather
 * than `HEAD^1`: in a shallow clone the boundary commit is grafted to have no
 * parents, and `rev-parse HEAD^1` then says "unknown revision" for a merge
 * commit whose parent simply was not fetched.
 */
function recordedParents(git: Git, rev: string): string[] {
  return git('cat-file', '-p', rev)
    .split('\n')
    .filter((line) => line.startsWith('parent '))
    .map((line) => line.slice('parent '.length))
}

/**
 * The first parent of a merge commit, verified present. Shared with
 * `native-surface-touched.ts`, which reads manifests at this same commit.
 */
export function mergeCommitFirstParent(cwd: string | undefined, rev = 'HEAD'): string {
  const git = gitIn(cwd)
  const parents = recordedParents(git, rev)
  if (parents.length !== 2) {
    fail(
      `${rev} has ${parents.length} parent(s), so it is not GitHub's pull-request merge commit. ` +
        'Resolve the base on the default `actions/checkout` of a pull_request run (refs/pull/N/merge), ' +
        'before any step checks out another commit.',
    )
  }
  const first = parents[0]!
  if (!hasCommit(git, first)) {
    fail(
      `the merge commit's first parent ${first} is not in this clone (a shallow checkout). ` +
        "Set `fetch-depth: 2` (or 0) on this job's actions/checkout.",
    )
  }
  return first
}

function readEvent(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const path = env['GITHUB_EVENT_PATH']
  if (!path) fail('GITHUB_EVENT_PATH is unset, so the event payload cannot be read.')
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch (err) {
    return fail(`could not read the event payload at ${path}: ${String(err)}`)
  }
}

function requirePresent(git: Git, sha: string, what: string): string {
  if (!SHA.test(sha)) fail(`${what} is ${JSON.stringify(sha)}, not a commit sha.`)
  if (!hasCommit(git, sha)) {
    fail(
      `${what} ${sha} is not in this clone (a shallow checkout). ` +
        `Use \`fetch-depth: 0\` on this job's actions/checkout, or run \`git fetch --no-tags --depth=1 origin ${sha}\` first.`,
    )
  }
  return sha
}

function localBase(git: Git, head: string, ref: string): DiffBase {
  let base: string
  try {
    base = git('merge-base', ref, 'HEAD')
  } catch {
    return fail(
      `no merge-base between ${ref} and HEAD. Run \`git fetch origin\`, or pass the base explicitly.`,
    )
  }
  return { base, head, rule: `local run: merge-base(${ref}, HEAD) = ${base}` }
}

function pullRequestBase(env: NodeJS.ProcessEnv, head: string, cwd: string | undefined): DiffBase {
  const sha = env['GITHUB_SHA'] ?? ''
  if (head !== sha) {
    fail(
      `HEAD is ${head}, but this pull_request run's merge commit (GITHUB_SHA) is ${sha || '(unset)'}. ` +
        'Resolve the base before any step checks out another commit.',
    )
  }
  const base = mergeCommitFirstParent(cwd)
  const payload = readEventIfPresent(env)
  const eventBase = (payload?.['pull_request'] as { base?: { sha?: string } } | undefined)?.base
    ?.sha
  const note =
    eventBase && eventBase !== base
      ? ` (the event's pull_request.base.sha ${eventBase} is older: main moved before GitHub built the merge ref; it is NOT used)`
      : ''
  return { base, head, rule: `pull_request: first parent of merge commit ${head} = ${base}${note}` }
}

function pushBase(env: NodeJS.ProcessEnv, git: Git, head: string): DiffBase {
  const before = String(readEvent(env)['before'] ?? '')
  if (/^0+$/.test(before)) {
    fail(
      'this push created the branch, so it has no previous tip to diff against. Treat it as a full run.',
    )
  }
  const base = requirePresent(git, before, "the push event's `before`")
  return { base, head, rule: `push: the replaced tip (event.before) = ${base}` }
}

/** Resolve the diff base for the current checkout. Throws a `[Pyreon]` error on any doubt. */
export function resolveDiffBase(opts: DiffBaseOptions = {}): DiffBase {
  const env = opts.env ?? process.env
  const git = gitIn(opts.cwd)
  const head = git('rev-parse', '--verify', 'HEAD^{commit}')
  if (env['GITHUB_ACTIONS'] !== 'true') return localBase(git, head, opts.localBase ?? 'origin/main')

  const event = env['GITHUB_EVENT_NAME'] ?? ''
  if (event === 'pull_request') return pullRequestBase(env, head, opts.cwd)
  if (event === 'push') return pushBase(env, git, head)
  if (event === 'merge_group') {
    const mg = readEvent(env)['merge_group'] as { base_sha?: string } | undefined
    const base = requirePresent(git, mg?.base_sha ?? '', 'merge_group.base_sha')
    return { base, head, rule: `merge_group: merge_group.base_sha = ${base}` }
  }
  return fail(
    `no change set is defined for a ${event || '(unknown)'} event. ` +
      'Run the full set for this event instead of selecting from a diff.',
  )
}

function readEventIfPresent(env: NodeJS.ProcessEnv): Record<string, unknown> | undefined {
  try {
    return env['GITHUB_EVENT_PATH'] ? readEvent(env) : undefined
  } catch {
    return undefined
  }
}

/** The changed files of the run: the tree diff `base → HEAD`, real (unquoted) names. */
export function changedFilesSinceBase(opts: DiffBaseOptions = {}): {
  base: DiffBase
  files: string[]
} {
  const base = resolveDiffBase(opts)
  // Two-dot: the tree diff between the two commits. It never needs a
  // merge-base, so it works on the depth-2 checkout a pull_request job has.
  return {
    base,
    files: gitChangedFilesZ(
      `${base.base}..${base.head}`,
      opts.cwd === undefined ? {} : { cwd: opts.cwd },
    ),
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  try {
    if (args.includes('--files')) {
      const { base, files } = changedFilesSinceBase()
      console.error(base.rule)
      if (files.length > 0) console.log(files.join('\n'))
    } else if (args.includes('--github-env')) {
      const base = resolveDiffBase()
      const target = process.env['GITHUB_ENV']
      if (!target) fail('--github-env needs GITHUB_ENV (it only runs inside a GitHub Actions job).')
      appendFileSync(target, `CI_BASE=${base.base}\n`)
      console.log(base.rule)
      console.log(`CI_BASE=${base.base}`)
    } else {
      console.log(resolveDiffBase().base)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
