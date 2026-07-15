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
 * `tsconfig*.json`, `vitest.shared.ts`, `.github/workflows/*`), we cannot
 * reason about what's affected — emit `--filter='*'` to run everything.
 *
 * `scripts/**` is DELIBERATELY excluded from the root-file net: a tooling
 * script owns no workspace and touches no package source, so package tests
 * are unaffected. It's covered by `@pyreon/test-utils`' script tests, so it's
 * mapped there as a LEAF seed (no dependent expansion — test-utils is a
 * universal devDependency, so expanding it would re-run ~all 60 packages).
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
  // NOTE: `scripts/` is deliberately NOT a root file. Scripts are standalone
  // tooling — they don't touch package SOURCE, so package tests are unaffected.
  // A script change can only break a test via @pyreon/test-utils (which
  // unit-tests several scripts), so it's mapped THERE in computeAffectedFlags
  // instead of escalating to `--filter=*`. The old blanket rule ran ALL ~60
  // packages, which flakes the local pre-push full-run under CPU contention.
  return false
}

/**
 * A standalone tooling script under `scripts/` (mapped to @pyreon/test-utils).
 *
 * `.json` is included deliberately: gate-INPUT data files (`import-budgets.json`,
 * `bundle-budgets.json`, `lint-baseline.json`, …) live here, their logic is
 * tested from @pyreon/test-utils, and — load-bearing — `e2e-affected.ts`
 * treats ANY `scripts/**` change as unknown-blast-radius → run ALL suites.
 * If this classifier returns false for a shape e2e-affected returns true for,
 * `affected` comes back empty → Bootstrap skips → the e2e matrix (needs:
 * bootstrap) skips → the fail-closed E2E aggregator errors on the
 * decide-says-run/suite-skipped contradiction, making a scripts-json-only PR
 * structurally un-mergeable. The two deciders MUST agree on `scripts/**`.
 */
export function isScriptFile(path: string): boolean {
  return path.startsWith('scripts/') && /\.(ts|tsx|js|mjs|cjs|json)$/.test(path)
}

/** The package whose tests cover `scripts/**` (affected target for script edits). */
export const SCRIPT_TEST_PACKAGE = '@pyreon/test-utils'

/**
 * Doc-INPUT files that a specific package's tests PARSE — a change to them is
 * docs-only for the heavy-job gate (`build` / `verify-modes` never read them),
 * but the consuming package's tests assert their structure, so that package's
 * test cell MUST run. Without this, e.g. reorganizing
 * `.claude/rules/anti-patterns.md` or renaming a `docs/patterns/*.md` merges
 * without `@pyreon/mcp`'s `anti-patterns.test.ts` / `patterns.test.ts` ever
 * running — and the MCP tool that ships those parsers then breaks silently.
 * Mapped as LEAF seeds (like `scripts/**`): only the consuming package's own
 * tests care, so we don't expand to its dependents.
 */
export const DOC_INPUT_CONSUMERS: ReadonlyArray<{ match: (p: string) => boolean; pkg: string }> = [
  { match: (p) => p === '.claude/rules/anti-patterns.md', pkg: '@pyreon/mcp' },
  { match: (p) => p.startsWith('docs/patterns/'), pkg: '@pyreon/mcp' },
]

/** The consuming package for a doc-input file, or undefined if it isn't one. */
export function docInputConsumer(path: string): string | undefined {
  return DOC_INPUT_CONSUMERS.find((c) => c.match(path))?.pkg
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

export function transitiveDependents(seeds: Set<string>, workspaces: Workspace[]): Set<string> {
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
  exclude: string[] = [],
): Set<string> {
  // `examples` is a PSEUDO-category mapping to the top-level `examples/`
  // dir — example apps live outside `packages/<category>/`. Every other
  // category maps to `packages/<category>/`.
  //
  // A category may name a NESTED path (`native/compiler`), narrowing to a
  // single package; `exclude` names nested paths to DROP. The pair exists so
  // one heavy package can get its own runner while its siblings share another,
  // with no package able to fall through the gap: the two `native` test cells
  // are `--category=native/compiler` and
  // `--category=native --exclude=native/compiler`, whose union is `native` BY
  // CONSTRUCTION. A newly-added `packages/native/<new>` therefore joins the
  // sibling cell automatically — an explicit allow-list would silently drop it
  // from CI, which is the drift this shape is chosen to prevent.
  const baseFor = (c: string) =>
    c === 'examples' ? join(root, 'examples') : join(root, 'packages', c)
  // "at or under" — a NESTED category (`native/compiler`) names the package's
  // OWN dir, so a strict `startsWith(base + '/')` would never match it. A
  // top-level category (`core`) only ever matches via the `/`-suffixed form,
  // and the suffix is what stops `core` from also matching a `core-extras`
  // sibling directory.
  const matches = (dir: string, c: string) => {
    const base = baseFor(c)
    return dir === base || dir.startsWith(base + '/')
  }
  const byName = new Map<string, Workspace>()
  for (const ws of workspaces) byName.set(ws.name, ws)

  const out = new Set<string>()
  for (const name of names) {
    const ws = byName.get(name)
    if (!ws) continue
    if (!matches(ws.dir, category)) continue
    if (exclude.some((e) => matches(ws.dir, e))) continue
    out.add(name)
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
  exclude?: string[] | undefined
  root?: string | undefined
}): string {
  const { changed, workspaces, category } = opts
  const exclude = opts.exclude ?? []
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

  // Seed set from owning workspaces (these EXPAND to their dependents).
  const seeds = new Set<string>()
  // Script changes are LEAF seeds: a `scripts/**` file owns no workspace, but
  // it's covered by @pyreon/test-utils' own script tests. It must NOT expand to
  // test-utils' dependents — test-utils is a universal devDependency (~30
  // packages → 92 via transitive closure), and a tooling-script edit affects
  // ONLY test-utils' script tests, never any consumer. Adding it as a leaf is
  // what actually keeps a script change off the full 60-package run.
  const leafSeeds = new Set<string>()
  const hasScriptTestPkg = workspaces.some((w) => w.name === SCRIPT_TEST_PACKAGE)
  for (const path of changed) {
    const ws = findOwningWorkspace(path, workspaces, root)
    if (ws) seeds.add(ws.name)
    else if (hasScriptTestPkg && isScriptFile(path)) leafSeeds.add(SCRIPT_TEST_PACKAGE)
    // A doc-INPUT file (`.claude/rules/anti-patterns.md`, `docs/patterns/**`)
    // must run the package that PARSES it. ADDITIVE, NOT a fallback: an
    // `else`-only branch would miss `docs/patterns/**`, which is already OWNED
    // by the @pyreon/docs workspace — so `findOwningWorkspace` matches, the
    // `else` never fires, and @pyreon/mcp's patterns.test.ts silently stops
    // running on a pattern-doc reorg. Seed the consumer as a LEAF regardless.
    const consumer = docInputConsumer(path)
    if (consumer && workspaces.some((w) => w.name === consumer)) leafSeeds.add(consumer)
  }

  if (seeds.size === 0 && leafSeeds.size === 0) return ''

  let closure = transitiveDependents(seeds, workspaces)
  // Add leaf seeds AFTER expansion (no dependents of their own get pulled in).
  for (const leaf of leafSeeds) closure.add(leaf)

  if (category) {
    closure = filterByCategory(closure, workspaces, category, root, exclude)
    if (closure.size === 0) return ''
  }

  // Emit unquoted flags — quoting is the shell's job, and embedding literal
  // single quotes here breaks GitHub Actions step outputs (the quotes are
  // preserved verbatim and bun receives `--filter='@pyreon/x'` literally,
  // matching no packages).
  return [...closure]
    .sort()
    .map((name) => `--filter=${name}`)
    .join(' ')
}

// ── Changed-file computation (robust to shallow CI clones) ──────────────────

/**
 * Files changed vs `base`, tried in order — each falls through to the next on
 * failure, so a shallow CI clone degrades GRACEFULLY instead of jumping
 * straight to "run everything":
 *
 *   1. `base...HEAD` — merge-base (symmetric) diff: ONLY what this branch
 *      added. The precise, ideal result — works when the merge-base commit is
 *      present (a full / fetch-depth:0 clone).
 *   2. `git merge-base base HEAD` then diff against it — same result as (1) by
 *      a different route; covers cases where the `...` syntax can't resolve.
 *   3. `base HEAD` — two-commit diff. OVER-includes files main changed since
 *      the branch point (they show as diffs), so it can over-run — but it
 *      NEVER under-runs, and it works as long as both commits are present
 *      (always true post-fetch, even shallow). This is what keeps a routine
 *      doc-only PR off the `--filter=*` escalation when the merge-base is
 *      unavailable.
 *
 * Returns null ONLY if every git call fails (the base ref doesn't exist at
 * all) — the caller then escalates to the full suite, the safe last resort.
 * execFileSync (argv array, no shell) keeps `base` un-injectable.
 */
export function gitChangedFiles(base: string, cwd: string = ROOT): string[] | null {
  const tryDiff = (args: string[]): string[] | null => {
    try {
      const out = execFileSync('git', ['diff', '--name-only', ...args], { cwd, encoding: 'utf-8' })
      return out.split('\n').filter(Boolean)
    } catch {
      return null
    }
  }
  // 1. merge-base symmetric diff (precise).
  const symmetric = tryDiff([`${base}...HEAD`])
  if (symmetric !== null) return symmetric
  // 2. explicit merge-base, then diff against it.
  try {
    const mb = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd, encoding: 'utf-8' }).trim()
    if (mb) {
      const viaMergeBase = tryDiff([mb, 'HEAD'])
      if (viaMergeBase !== null) return viaMergeBase
    }
  } catch {
    /* fall through to the two-commit diff */
  }
  // 3. two-commit diff (over-includes, never under-includes).
  const twoCommit = tryDiff([base, 'HEAD'])
  if (twoCommit !== null) return twoCommit
  // Every git call failed — base ref unresolvable. Escalate.
  return null
}

// ── Docs-only classification (Layer-2 heavy-job gate) ───────────────────────

/**
 * A path that CANNOT affect any build / test / typecheck output — pure prose.
 * The heavy CI jobs (build, verify-modes, coverage, browser/rust tests,
 * audit-types, bundle/import budgets, distribution, manifest-depth) gate on
 * the inverse of `isDocsOnlyChange`, so a PR touching ONLY these paths skips
 * all of them and runs just the fast gates (lint, doc-claims, docs-sync, …).
 *
 * STRICT allowlist — anything not matched here is treated as code (the
 * conservative bias: never skip a heavy job for a real source change):
 *   - any `*.md` / `*.mdx` (CLAUDE.md, READMEs, anti-patterns.md, …)
 *   - the docs site content (`docs/**`) — its own `docs-sync` gate covers it
 *   - the `.claude/**` rules / audits / plans
 *   - the generated AI-reference files `llms.txt` / `llms-full.txt`
 *
 * NOTE `.github/**`, `scripts/**`, `package.json`, lockfiles, tsconfig, and
 * every `packages/**` / `examples/**` source file are NOT docs → code=true.
 */
const DOCS_PATTERNS: RegExp[] = [
  /\.mdx?$/i,
  /^docs\//,
  /^\.claude\//,
  /^llms(-full)?\.txt$/,
]

export function isDocsOnlyChange(changed: string[] | null): boolean {
  // null = git couldn't compute the diff → unknowable → treat as code (run).
  if (changed === null) return false
  // Empty diff = nothing changed → no heavy work needed → docs-only=true.
  if (changed.length === 0) return true
  return changed.every((path) => DOCS_PATTERNS.some((re) => re.test(path)))
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  let base = 'origin/main'
  let category: string | undefined
  const exclude: string[] = []
  let codeChanged = false
  let hasAffected = false
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--base=')) base = arg.slice('--base='.length)
    else if (arg.startsWith('--category=')) category = arg.slice('--category='.length)
    // `--exclude=<nested/category>` (repeatable) drops packages under that path
    // from the emit. Pairs with `--category` so a heavy package can be split
    // onto its own runner while its siblings stay covered by the complement.
    else if (arg.startsWith('--exclude=')) exclude.push(arg.slice('--exclude='.length))
    // `--code-changed` prints `true`/`false`: does this diff touch anything
    // beyond pure docs? Gates the READ-NOTHING heavy jobs (build, verify-modes,
    // coverage, browser/rust, audit-types, budgets, distribution, …).
    else if (arg === '--code-changed') codeChanged = true
    // `--has-affected` prints `true`/`false`: is ANY package affected (incl. a
    // doc-INPUT change → its consuming package)? Gates bootstrap + the test /
    // typecheck cells — those must run on a doc-input change even though it is
    // docs-only for the heavy jobs. Non-empty affected (or an unknowable diff →
    // `--filter=*`) → true; only a genuinely empty affected set → false.
    else if (arg === '--has-affected') hasAffected = true
  }

  const changed = gitChangedFiles(base)

  if (codeChanged) {
    process.stdout.write(isDocsOnlyChange(changed) ? 'false' : 'true')
    return
  }

  if (hasAffected) {
    const workspaces = discoverWorkspaces()
    process.stdout.write(computeAffectedFlags({ changed, workspaces }) !== '' ? 'true' : 'false')
    return
  }

  const workspaces = discoverWorkspaces()
  const flags = computeAffectedFlags({ changed, workspaces, category, exclude })
  process.stdout.write(flags)
}

main()
