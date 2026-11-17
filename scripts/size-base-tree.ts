/**
 * size-base-tree — turns a worktree of the commit a pull request merges into
 * into something that builds: the head's `lib/` trees and installed
 * dependencies, corrected by an incremental bootstrap.
 *
 * Shared by the two programs that measure a base: `size-base` (package
 * bundles, minimal imports, zero routes; the `Build` job) and
 * `check-site-budgets` (the docs site's routes; the e2e job).
 *
 * The base worktree gets the head's `lib/` trees and bootstrap manifest, and
 * the bootstrap script rebuilds only the packages whose sources differ (it
 * content-hashes sources and `lib/`), which is the same "nearest lib/,
 * corrected incrementally" path CI's cache fallback uses.
 */

import { spawnSync } from 'node:child_process'
import { cpSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { EXAMPLE_GROUPS } from './example-dirs'
import { listDirIfExists } from './fs-read'

const REPO_ROOT = resolve(import.meta.dirname, '..')

/** Runs a command to completion and returns its stdout; a non-zero exit throws with both streams. */
export function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>): string {
  const started = Date.now()
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...env },
  })
  if (r.status !== 0) {
    throw new Error(
      `[Pyreon] size-base: \`${cmd} ${args.join(' ')}\` failed in ${cwd} (exit ${r.status}).\n${r.stdout.slice(-4000)}\n${r.stderr.slice(-4000)}`,
    )
  }
  console.log(`[size-base] ${cmd} ${args.slice(0, 3).join(' ')} — ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return r.stdout
}

/** Copies every built `lib/` of the head into the same package of `base`. */
function seedLib(base: string): void {
  // Each copy is attempted, not preceded by an existence check: a package the
  // base does not have, or one with no `lib/`, fails the copy with ENOENT and
  // is skipped. Bootstrap then builds whatever is missing.
  for (const cat of listDirIfExists(join(REPO_ROOT, 'packages'))) {
    for (const pkg of listDirIfExists(join(REPO_ROOT, 'packages', cat.name))) {
      const rel = join('packages', cat.name, pkg.name, 'lib')
      copyIfPresent(join(REPO_ROOT, rel), join(base, rel))
    }
  }
  // The compiler's native binary is an untracked build artifact. Route cells
  // compile through it when it exists and through the JS backend when it does
  // not, and the two emit a few bytes apart, so the base must use whichever
  // backend the head has. (CI's Build job has none at this point.)
  const native = join('packages', 'core', 'compiler', 'native')
  for (const file of listDirIfExists(join(REPO_ROOT, native))) {
    if (file.name.endsWith('.node')) copyIfPresent(join(REPO_ROOT, native, file.name), join(base, native, file.name))
  }
  copyIfPresent(join(REPO_ROOT, '.bootstrap-cache.json'), join(base, '.bootstrap-cache.json'))
}

/**
 * Copies `from` to `to`; a source or destination parent that does not exist is
 * skipped (returns false). One operation, with no existence check before it.
 */
function copyIfPresent(from: string, to: string): boolean {
  try {
    cpSync(from, to, { recursive: true })
    return true
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return false
    throw err
  }
}

/**
 * Gives `base` the head's installed dependencies by hard-linking them, which
 * takes seconds where an install takes a minute (CI's Build job restores
 * `node_modules`, not bun's download cache, so an install there downloads
 * every tarball). Only valid when both trees have the same lockfile; every
 * workspace symlink bun writes is relative, so the links resolve inside
 * `base`. Returns false when it could not link everything; the caller then
 * installs.
 */
function linkNodeModules(base: string): boolean {
  // Which workspaces have a `node_modules`, and which of them the base also
  // has, is read from directory listings, never probed per path.
  const groups = ['node_modules']
  const parents = [
    '.',
    'examples',
    ...EXAMPLE_GROUPS.map((g) => join('examples', g)),
    ...listDirIfExists(join(REPO_ROOT, 'packages')).map((c) => join('packages', c.name)),
  ]
  for (const parent of parents) {
    const inBase = new Set(listDirIfExists(join(base, parent)).map((e) => e.name))
    for (const entry of listDirIfExists(join(REPO_ROOT, parent))) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || !inBase.has(entry.name)) continue
      if (parent === '.' && entry.name !== 'docs') continue
      const installed = listDirIfExists(join(REPO_ROOT, parent, entry.name)).some((e) => e.name === 'node_modules')
      if (installed) groups.push(join(parent, entry.name, 'node_modules'))
    }
  }
  for (const group of groups) {
    const linked = spawnSync('cp', ['-al', join(REPO_ROOT, group), join(base, group)], { stdio: 'ignore' })
    if (linked.status !== 0) return false
  }
  return true
}

/**
 * Makes the base worktree at `dir` buildable. `sameLock`: the head and the
 * base have the same lockfile, so the head's dependencies can be linked
 * instead of installed.
 */
export function prepareBaseTree(dir: string, sameLock: boolean): void {
  seedLib(dir)
  const started = Date.now()
  if (sameLock && linkNodeModules(dir)) {
    console.log(`[size-base] dependencies linked from the head — ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } else {
    run('bun', ['install', '--frozen-lockfile'], dir, { PYREON_BOOTSTRAP_SKIP: '1' })
  }
  run('bun', ['scripts/bootstrap.ts'], dir)
}
