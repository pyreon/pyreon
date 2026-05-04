#!/usr/bin/env bun
/**
 * Install Pyreon's git hooks via `core.hooksPath`.
 *
 * Phase E1 of the production-readiness plan — see
 * `.claude/plans/ecosystem-improvements-2026-q2.md`.
 *
 * Why `core.hooksPath` instead of husky / simple-git-hooks:
 *
 *  1. No new dev dependency. `core.hooksPath` is git ≥ 2.9 (2016+).
 *  2. Hooks live in `.githooks/`, version-controlled, executable on
 *     checkout. Nothing magical to install — git just looks at the
 *     directory configured here.
 *  3. Idempotent — running it twice does nothing on the second run.
 *  4. Skips quietly outside a git repo (CI-tarball case, fresh
 *     `npm pack` extracts, etc.) so a downstream consumer who
 *     runs `bun install` against our package source isn't surprised
 *     by a non-zero exit.
 *
 * Bypass for individual pushes: `PYREON_SKIP_PRE_PUSH=1 git push` or
 * `git push --no-verify`. Disable repo-wide:
 * `git config --unset core.hooksPath`.
 *
 * Wired into the existing `postinstall` flow via `scripts/bootstrap.ts`,
 * so it runs once on `bun install` and then never again until the
 * setting is unset.
 */

import { execSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const HOOKS_DIR = '.githooks'

function run(cmd: string, opts: { capture?: boolean } = {}): string | null {
  try {
    if (opts.capture) {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    }
    execSync(cmd, { stdio: 'ignore' })
    return null
  } catch {
    return null
  }
}

function isGitRepo(): boolean {
  return run('git rev-parse --git-dir', { capture: true }) !== null
}

function getCurrentHooksPath(): string | null {
  return run('git config --get core.hooksPath', { capture: true })
}

function canonicalize(path: string): string {
  // realpathSync resolves symlinks (matters on macOS where /tmp →
  // /private/tmp, and on systems where the user's git checkout lives
  // under a symlinked path). Falls back to the original if the path
  // doesn't exist — comparison still works for stored values.
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function getDefaultHooksPaths(repoRoot: string): string[] {
  // Collect every path that git COULD use as the default hooks
  // directory. In a main checkout, only one matches: `<git-dir>/hooks`.
  // In a worktree, `core.hooksPath` is repo-shared and still points at
  // the main checkout's `<git-common-dir>/hooks`, but the worktree's
  // own `git rev-parse --git-dir` returns the per-worktree git dir
  // (`<main-git-dir>/worktrees/<name>`). We have to accept BOTH.
  // All paths are canonicalized via realpathSync so symlinks
  // (notably macOS's `/var` → `/private/var`) don't cause false
  // mismatches.
  const paths = new Set<string>()
  const gitDir = run('git rev-parse --git-dir', { capture: true }) ?? '.git'
  const gitCommonDir = run('git rev-parse --git-common-dir', { capture: true }) ?? gitDir
  paths.add(canonicalize(resolve(repoRoot, gitDir, 'hooks')))
  paths.add(canonicalize(resolve(repoRoot, gitCommonDir, 'hooks')))
  return [...paths]
}

function main(): void {
  if (!isGitRepo()) {
    // Tarball / fresh extract / non-git checkout — nothing to wire up.
    return
  }

  const repoRoot = run('git rev-parse --show-toplevel', { capture: true })
  if (!repoRoot) return

  const hooksDirAbs = resolve(repoRoot, HOOKS_DIR)
  if (!existsSync(hooksDirAbs)) {
    // Repo doesn't have the hooks directory committed — common when an
    // older clone exists alongside a newer install. Don't error.
    return
  }

  const current = getCurrentHooksPath()
  if (current === HOOKS_DIR) {
    // Already configured — exit silently. This runs on every `bun install`,
    // so noisy success messages would clutter routine workflows.
    return
  }

  // Distinguish "real user override" (husky, lefthook, custom path) from
  // "core.hooksPath happens to point at git's default location". The
  // default is `<git-dir>/hooks` — an older bootstrap may have set it
  // explicitly, or the user may have set it without realising it
  // matches the default. In either case, Pyreon's hook at .githooks/ is
  // orphaned because git looks at the configured path. Treat the
  // default-location case as "no real override" and replace with our
  // hooks directory.
  //
  // This is the gap-#1 fix from the structural-cleanup sequence —
  // pre-fix any non-empty `current` was treated as a user override and
  // Pyreon's pre-push validation never fired.
  const defaultHooksPaths = getDefaultHooksPaths(repoRoot)
  const currentResolved = current ? canonicalize(resolve(repoRoot, current)) : null
  const isDefaultPath = currentResolved !== null && defaultHooksPaths.includes(currentResolved)

  if (current && !isDefaultPath) {
    // The user has a real custom hooks path (husky / lefthook / custom).
    // Don't clobber it — print a one-line note and exit so they can
    // wire ours in manually if they want.
    console.warn(
      `[pyreon] core.hooksPath is set to "${current}" — leaving as-is.\n` +
        `        Pyreon's hooks live in .githooks/ — chain them in if desired.`,
    )
    return
  }

  // Either no config OR config points to git's default `<git-dir>/hooks`
  // (which means Pyreon's hook isn't running). Install ours.
  run(`git config core.hooksPath ${HOOKS_DIR}`)
  console.log('[pyreon] git hooks installed (.githooks/) — pre-push validation enabled.')
  console.log('[pyreon] bypass with PYREON_SKIP_PRE_PUSH=1 or git push --no-verify.')
}

main()
