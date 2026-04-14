#!/usr/bin/env bun
/**
 * Affected-package filter — emits `--filter='@pyreon/x'` flags for `bun run`.
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
 * ## Usage
 *
 *   bun run scripts/affected.ts                    # base = origin/main
 *   bun run scripts/affected.ts --base=HEAD~3      # custom base
 *   bun run scripts/affected.ts --base=origin/dev
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// ── Args ───────────────────────────────────────────────────────────────────

let base = 'origin/main'
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--base=')) base = arg.slice('--base='.length)
}

// ── Root-level file patterns that force the full suite ─────────────────────

function isRootFile(path: string): boolean {
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

interface Workspace {
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

function discoverWorkspaces(): Workspace[] {
  const result: Workspace[] = []

  // packages/<category>/<pkg>
  const packagesRoot = join(ROOT, 'packages')
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
  const examplesRoot = join(ROOT, 'examples')
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
  const docsPkg = join(ROOT, 'docs', 'package.json')
  if (existsSync(docsPkg)) {
    const json = readPkg(docsPkg)
    if (json.name)
      result.push({ name: json.name, dir: join(ROOT, 'docs'), deps: collectPyreonDeps(json) })
  }

  return result
}

// ── Path → owning workspace ────────────────────────────────────────────────

function findOwningWorkspace(filePath: string, workspaces: Workspace[]): Workspace | undefined {
  const abs = resolve(ROOT, filePath)
  // Walk up looking for package.json; first match that corresponds to a known
  // workspace wins. This handles nested files inside packages/<cat>/<pkg>/...
  let dir = dirname(abs)
  while (dir.startsWith(ROOT) && dir !== ROOT) {
    if (existsSync(join(dir, 'package.json'))) {
      const ws = workspaces.find((w) => w.dir === dir)
      if (ws) return ws
      // package.json exists but isn't a tracked workspace — keep walking up
      // (covers nested fixtures with their own package.json).
    }
    dir = dirname(dir)
  }
  return undefined
}

// ── Reverse-dep graph + BFS ────────────────────────────────────────────────

function transitiveDependents(seeds: Set<string>, workspaces: Workspace[]): Set<string> {
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

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  let diffOut: string
  try {
    diffOut = execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: ROOT,
      encoding: 'utf-8',
    })
  } catch {
    // Diff failed (bad base ref, shallow clone, etc.) — be safe, run all.
    process.stdout.write("--filter='*'")
    return
  }

  const changed = diffOut.split('\n').filter(Boolean)
  if (changed.length === 0) {
    process.stdout.write('')
    return
  }

  // Root-file safety net first.
  for (const path of changed) {
    if (isRootFile(path)) {
      process.stdout.write("--filter='*'")
      return
    }
  }

  const workspaces = discoverWorkspaces()
  const seeds = new Set<string>()
  for (const path of changed) {
    const ws = findOwningWorkspace(path, workspaces)
    if (ws) seeds.add(ws.name)
  }

  if (seeds.size === 0) {
    // No workspace-owned files changed (e.g. only top-level docs/README.md).
    process.stdout.write('')
    return
  }

  const closure = transitiveDependents(seeds, workspaces)
  const flags = [...closure].sort().map((name) => `--filter='${name}'`)
  process.stdout.write(flags.join(' '))
}

main()
