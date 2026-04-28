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
import { existsSync } from 'node:fs'
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

  if (current && current !== HOOKS_DIR) {
    // The user has a custom hooks path (husky, lefthook, custom). Don't
    // clobber it — print a one-line note and exit so they can wire ours
    // in manually if they want.
    console.warn(
      `[pyreon] core.hooksPath is set to "${current}" — leaving as-is.\n` +
        `        Pyreon's hooks live in .githooks/ — chain them in if desired.`,
    )
    return
  }

  run(`git config core.hooksPath ${HOOKS_DIR}`)
  console.log('[pyreon] git hooks installed (.githooks/) — pre-push validation enabled.')
  console.log('[pyreon] bypass with PYREON_SKIP_PRE_PUSH=1 or git push --no-verify.')
}

main()
