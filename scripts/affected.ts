#!/usr/bin/env bun
/**
 * Affected-package filter — emits `--filter=@pyreon/x` flags for `bun run`.
 *
 * ## Why
 *
 * On pull_request CI we want to run lint/typecheck/test/build only against
 * packages whose source actually changed (plus their reverse-dependency
 * closure, since a change to `@pyreon/core` invalidates everything that
 * depends on it). On `push: main` and `merge_group` we still want the full
 * suite as a safety net — that's the workflow's job, not this script's.
 *
 * ## How
 *
 * 1. `git diff --name-only <base>...HEAD` → changed file paths.
 * 2. For each path, walk up to the nearest `package.json` inside `packages/`,
 *    `examples/`, or `docs/` — that's the "owning workspace".
 * 3. Build the workspace map: `{ pkgName -> { dir, deps: [...@pyreon/...] } }`
 *    by scanning every workspace `package.json` for `@pyreon/*` entries in
 *    `dependencies` / `devDependencies` / `peerDependencies`.
 * 4. Build the reverse-dep graph and BFS from changed packages → transitive
 *    closure of "impacted" packages.
 * 5. Print one `--filter='<name>'` per package, space-separated.
 *
 * ## Root-file safety net
 *
 * If any "root-level" file changed (root `package.json`, `bun.lock`, root
 * `tsconfig*.json`, `vitest.shared.ts`, `.github/workflows/*`, `scripts/*`),
 * we cannot reason about what's affected — emit `--filter='*'` to run
 * everything.
 *
 * ## Empty case
 *
 * If no files map to any workspace and no root files changed (e.g. only
 * `README.md` at root edited), emit an empty string. CI jobs must treat
 * empty as "skip gracefully" (succeed without running anything).
 *
 * ## Category filter (P3b — sharding)
 *
 * `--category=<name>` restricts the OUTPUT to packages under
 * `packages/<name>/*`. The transitive closure is still computed against the
 * full workspace graph (so a `@pyreon/core` change still expands to every
 * dependent), but the final emit drops anything outside the named category.
 * Returns an empty string if no affected package matches the category
 * (cell's `bun run` then skips gracefully — same contract as the no-changes
 * empty case).
 *
 * `--category=*` ALSO returns the full-suite signal verbatim: a root-file
 * change emits `--filter=*` regardless of category — every cell runs the
 * full suite for its own category. Without that propagation, a workflow
 * change would silently skip every shard cell because no per-package
 * `--filter=` flag would land in any one cell's output.
 *
 * ## Usage
 *
 *   bun run scripts/affected.ts                    # base = origin/main
 *   bun run scripts/affected.ts --base=HEAD~3      # custom base
 *   bun run scripts/affected.ts --base=origin/dev
 *   bun run scripts/affected.ts --category=core    # only @pyreon/* under packages/core/
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// ── Root-level file patterns that force the full suite ─────────────────────

export function isRootFile(path: string): boolean {
  if (path === 'package.json') return true
  if (path === 'bun.lock') return true
  if (path === 'vitest.shared.ts') return true
  if (path === 'vitest.browser.ts') return true
  if (/^tsconfig.*\.json$/.test(path)) return true
  if (path.startsWith('.github/workflows/')) return true
  if (path.startsWith('scripts/')) return true
  return false
}

// ── Workspace discovery ────────────────────────────────────────────────────

export interface Workspace {
  name: string
  dir: string // absolute
  deps: string[] // @pyreon/* names
}

function readPkg(pkgJsonPath: string): {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
} {
  return JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
}

function collectPyreonDeps(pkg: ReturnType<typeof readPkg>): string[] {
  const out: string[] = []
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const map = pkg[field]
    if (!map) continue
    for (const name of Object.keys(map)) {
      if (name.startsWith('@pyreon/')) out.push(name)
    }
  }
  return out
}

export function discoverWorkspaces(root: string = ROOT): Workspace[] {
  const result: Workspace[] = []

  // packages/<category>/<pkg>
  const packagesRoot = join(root, 'packages')
  if (existsSync(packagesRoot)) {
    for (const category of readdirSync(packagesRoot)) {
      const categoryPath = join(packagesRoot, category)
      if (!statSync(categoryPath).isDirectory()) continue
      for (const pkg of readdirSync(categoryPath)) {
        const pkgPath = join(categoryPath, pkg)
        const pkgJson = join(pkgPath, 'package.json')
        if (!existsSync(pkgJson)) continue
        const json = readPkg(pkgJson)
        if (!json.name) continue
        result.push({ name: json.name, dir: pkgPath, deps: collectPyreonDeps(json) })
      }
    }
  }

  // examples/<example>
  const examplesRoot = join(root, 'examples')
  if (existsSync(examplesRoot)) {
    for (const ex of readdirSync(examplesRoot)) {
      const exPath = join(examplesRoot, ex)
      const pkgJson = join(exPath, 'package.json')
      if (!existsSync(pkgJson)) continue
      const json = readPkg(pkgJson)
      if (!json.name) continue
      result.push({ name: json.name, dir: exPath, deps: collectPyreonDeps(json) })
    }
  }

  // docs
  const docsPkg = join(root, 'docs', 'package.json')
  if (existsSync(docsPkg)) {
    const json = readPkg(docsPkg)
    if (json.name)
      result.push({ name: json.name, dir: join(root, 'docs'), deps: collectPyreonDeps(json) })
  }

  return result
}

// ── Path → owning workspace ────────────────────────────────────────────────

export function findOwningWorkspace(
  filePath: string,
  workspaces: Workspace[],
  root: string = ROOT,
): Workspace | undefined {
  const abs = resolve(root, filePath)
  // Walk up matching dirs against the discovered workspace set; first hit
  // wins. This handles nested files inside packages/<cat>/<pkg>/... AND
  // nested test fixtures (their own package.json never appears in the
  // workspace set, so we keep walking past them). Pure structural lookup —
  // no filesystem stat — so synthetic fake-root inputs in unit tests work
  // identically to real-repo input.
  let dir = dirname(abs)
  while (dir.startsWith(root) && dir !== root) {
    const ws = workspaces.find((w) => w.dir === dir)
    if (ws) return ws
    dir = dirname(dir)
  }
  return undefined
}

// ── Reverse-dep graph + BFS ────────────────────────────────────────────────

export function transitiveDependents(
  seeds: Set<string>,
  workspaces: Workspace[],
): Set<string> {
  // Build reverse graph: dep -> [dependents]
  const reverse = new Map<string, Set<string>>()
  for (const ws of workspaces) {
    for (const d of ws.deps) {
      let bucket = reverse.get(d)
      if (!bucket) {
        bucket = new Set<string>()
        reverse.set(d, bucket)
      }
      bucket.add(ws.name)
    }
  }

  const closure = new Set<string>(seeds)
  const queue = [...seeds]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    const dependents = reverse.get(cur)
    if (!dependents) continue
    for (const dep of dependents) {
      if (!closure.has(dep)) {
        closure.add(dep)
        queue.push(dep)
      }
    }
  }
  return closure
}

// ── Category filter ────────────────────────────────────────────────────────
// Restricts a workspace name set to those whose `dir` sits under
// `<root>/packages/<category>/`. Used by the P3b shard cells so each
// matrix cell only runs the slice of the affected set that lives in its
// category. Cells whose category has no affected packages get an empty
// result and skip gracefully.
//
// Note: `docs/` workspaces never belong to a category — they fall outside
// `packages/` and outside the `examples` pseudo-category, so the shard
// cells don't cover docs (docs-sync covers it). Example apps DO have a
// dedicated `examples` pseudo-category (see below) — the `typecheck
// (examples)` shard cell narrows to it so example type regressions are
// caught in CI (they read `@pyreon/*` via the bun→src condition, no lib
// needed). Their `test`/`e2e` coverage still lives in verify-modes + e2e.

export function filterByCategory(
  names: Set<string>,
  workspaces: Workspace[],
  category: string,
  root: string = ROOT,
): Set<string> {
  // `examples` is a PSEUDO-category mapping to the top-level `examples/`
  // dir — example apps live outside `packages/<category>/`. Every other
  // category maps to `packages/<category>/`.
  const prefix =
    category === 'examples'
      ? join(root, 'examples') + '/'
      : join(root, 'packages', category) + '/'
  const byName = new Map<string, Workspace>()
  for (const ws of workspaces) byName.set(ws.name, ws)

  const out = new Set<string>()
  for (const name of names) {
    const ws = byName.get(name)
    if (!ws) continue
    if (ws.dir.startsWith(prefix)) out.add(name)
  }
  return out
}

// ── Pure compute ───────────────────────────────────────────────────────────
// Decoupled from git/IO so unit tests can drive it directly. Returns the
// FLAGS string the script prints (`--filter=X --filter=Y` / `--filter=*`
// / empty). The category filter applies to the final emit, never to the
// closure computation (a category-`core` change still EXPANDS to every
// `@pyreon/*` consumer; the cell just narrows the EMIT to category-local
// names so each cell runs only its own slice in parallel).

export function computeAffectedFlags(opts: {
  changed: string[] | null
  workspaces: Workspace[]
  category?: string | undefined
  root?: string | undefined
}): string {
  const { changed, workspaces, category } = opts
  const root = opts.root ?? ROOT

  // Diff failed (bad base / shallow clone) — full suite (per-category if asked).
  if (changed === null) return '--filter=*'

  // No changes → no-op everywhere.
  if (changed.length === 0) return ''

  // Root-file safety net first. Even with a category filter, a root file
  // change escalates EVERY cell to its full slice — the only way to keep
  // the cell skip path safe (a workflow change that affects nothing per-
  // package would otherwise silently skip every shard cell).
  for (const path of changed) {
    if (isRootFile(path)) return '--filter=*'
  }

  // Seed set from owning workspaces.
  const seeds = new Set<string>()
  for (const path of changed) {
    const ws = findOwningWorkspace(path, workspaces, root)
    if (ws) seeds.add(ws.name)
  }

  if (seeds.size === 0) return ''

  let closure = transitiveDependents(seeds, workspaces)

  if (category) {
    closure = filterByCategory(closure, workspaces, category, root)
    if (closure.size === 0) return ''
  }

  // Emit unquoted flags — quoting is the shell's job, and embedding literal
  // single quotes here breaks GitHub Actions step outputs (the quotes are
  // preserved verbatim and bun receives `--filter='@pyreon/x'` literally,
  // matching no packages).
  return [...closure].sort().map((name) => `--filter=${name}`).join(' ')
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  let base = 'origin/main'
  let category: string | undefined
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--base=')) base = arg.slice('--base='.length)
    else if (arg.startsWith('--category=')) category = arg.slice('--category='.length)
  }

  let changed: string[] | null
  try {
    // execFileSync (not execSync) — argv array, no shell interpretation.
    // CodeQL's "indirect uncontrolled command line" rule flags string-
    // interpolated execSync calls even when the value comes from our own
    // CI; defense-in-depth here removes the entire class of shell-injection
    // concerns (`--base="; rm -rf / #"` is just an unknown ref to git now,
    // not executable shell). Same fix shape applies to scripts/e2e-affected.ts
    // — tracked as a follow-up to keep this PR scoped to the typecheck/test
    // shard work.
    const diffOut = execFileSync(
      'git',
      ['diff', '--name-only', `${base}...HEAD`],
      { cwd: ROOT, encoding: 'utf-8' },
    )
    changed = diffOut.split('\n').filter(Boolean)
  } catch {
    // Diff failed (bad base ref, shallow clone, etc.) — be safe, run all.
    changed = null
  }

  const workspaces = discoverWorkspaces()
  const flags = computeAffectedFlags({ changed, workspaces, category })
  process.stdout.write(flags)
}

main()
