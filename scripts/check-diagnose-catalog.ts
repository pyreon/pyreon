#!/usr/bin/env bun
/**
 * CI guard: PRs touching framework error-surface SOURCE CODE in
 * `runtime-dom/`, `runtime-server/`, `core/`, `compiler/`, `router/` must
 * grow the `ERROR_PATTERNS` catalog in
 * `packages/core/compiler/src/diagnose.ts` — or carry a
 * `skip-diagnose-catalog` label.
 *
 * ## Why
 *
 * `pyreon doctor diagnose` + the MCP `diagnose` tool both pattern-match
 * user-facing error strings to surface fix suggestions. Every bug fix
 * in a framework subsystem that COULD have surfaced as a user-visible
 * error is an opportunity to teach the catalog. Without a CI gate, the
 * catalog silently stops growing while the framework's surface area
 * expands — `diagnose` returns "no match" more and more often, agents
 * call it fewer times, the loop closes.
 *
 * ## What counts as a "sensitive change"
 *
 * **Only real source-code changes** under one of the sensitive packages'
 * `src/` directories, with a `.ts` / `.tsx` extension, **excluding tests
 * and Storybook stories** — those are the files where a real bug fix
 * lives. Specifically NOT sensitive:
 *
 * - `package.json` — dep bumps, peer-dep widening, workspace-protocol
 *   cascades from a release PR's version sync. None of these introduce
 *   new error surface; a devDeps bump was the exact false-positive that
 *   prompted this refinement (#1166).
 * - `CHANGELOG.md`, `README.md`, `LICENSE` — documentation / release
 *   notes; never grow the catalog.
 * - `tsconfig.json`, `vitest.config.ts`, `vitest.browser.config.ts`,
 *   `vitest.shared.ts` — build / test config; not source code.
 * - Tests (`*.test.ts(x)`, `*.spec.ts(x)`, files under `src/tests/` or
 *   `src/__tests__/`) — a new regression test for an existing bug doesn't
 *   warrant a new catalog entry on its own; if a regression test ships
 *   alongside a real source-code fix, the source-code change triggers
 *   the gate independently.
 * - Storybook stories (`*.stories.ts(x)`) — render-side docs; no error
 *   surface.
 * - `src/manifest.ts` — the `defineManifest` docs-metadata source consumed
 *   by `gen-docs` (→ llms / MCP api-reference). It has zero runtime
 *   behavior and is stripped from the published tarball (`publish.ts`
 *   drops `src/`), so it can never introduce user-visible error surface.
 *   It's the one docs file that happens to be `.ts` — same bucket as
 *   CHANGELOG / README, which are already excluded by extension.
 * - Generated `lib/` output — gitignored, never committed; included here
 *   as defense-in-depth in case someone ever commits build output.
 *
 * The label-bypass + release-PR-auto-skip stay in place for the
 * legitimate "source did change, but no new error surface" cases
 * (perf-only refactor, type tightening, internal renames).
 *
 * ## History
 *
 * - First cut (#???) used `startsWith('packages/core/<pkg>/')` — matched
 *   every file in those packages including `package.json` / CHANGELOG /
 *   README / tests. Most non-source-fix PRs touching those packages
 *   needed `skip-diagnose-catalog` applied manually, defeating the
 *   gate's signal-to-noise ratio. The deps-bump PR #1166 triggered this
 *   even though no .ts file in those packages changed — a clear false
 *   positive that proved the detector was too coarse.
 * - This iteration narrows the detector to source files only, exposes
 *   the predicate as a pure function (`isSensitiveSourceFile`), and
 *   adds a unit-test surface in
 *   `packages/internals/test-utils/src/tests/check-diagnose-catalog.test.ts`.
 *   Same shape as `scripts/affected.ts` / `scripts/e2e-affected.ts`.
 *
 * ## Mechanics
 *
 * 1. Get changed-file list via `git diff origin/${BASE_REF}...HEAD`.
 * 2. Filter through `isSensitiveSourceFile`. If none → exit 0.
 * 3. If `HAS_SKIP_LABEL=true` → exit 0 (deliberate bypass).
 * 4. If `HEAD_REF` matches `changeset-release/*` → exit 0 (release PR).
 * 5. Count `ERROR_PATTERNS` entries in both `origin/${BASE_REF}` and HEAD
 *    versions of `diagnose.ts`. If HEAD count > base count → pass.
 * 6. Otherwise → fail with a clear "add a new entry, or label to bypass"
 *    message.
 */

import { execFileSync } from 'node:child_process'
import { isTestPath } from './test-paths'

// ─── Pure exports (testable) ────────────────────────────────────────────────

// The `ERROR_PATTERNS` catalog lives in the browser-safe `diagnose.ts` module
// (extracted from `react-intercept.ts` so it loads without the TypeScript
// compiler API). This gate counts entries there.
export const CATALOG_FILE = 'packages/core/compiler/src/diagnose.ts'
export const CATALOG_MARKER = 'const ERROR_PATTERNS: ErrorPattern[] = ['

/** Packages whose source files form the framework's error surface. */
export const SENSITIVE_PACKAGES = [
  'runtime-dom',
  'runtime-server',
  'core',
  'compiler',
  'router',
] as const

/**
 * Whether a single changed-file path represents a real source-code
 * change in one of the sensitive packages. Pure function — exported for
 * unit-test coverage; the script's main path calls it via
 * `touchesSensitivePaths`.
 *
 * Rules:
 * - Must be under `packages/core/<sensitive>/src/`.
 * - Must end with `.ts` or `.tsx` (`.d.ts` is included by extension).
 * - Must NOT be test code — `isTestPath` (test/spec/story file OR a
 *   `tests/` / `__tests__/` directory at any depth). A new regression
 *   test for an existing bug doesn't need a catalog entry. Classified by
 *   the shared `scripts/test-paths.ts`, the SAME source of truth the
 *   changeset gate uses — one definition, no drift.
 */
export function isSensitiveSourceFile(file: string): boolean {
  // 1. Package + src/ prefix
  const inSensitiveSrc = SENSITIVE_PACKAGES.some((pkg) =>
    file.startsWith(`packages/core/${pkg}/src/`),
  )
  if (!inSensitiveSrc) return false

  // 2. TypeScript source extension
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false

  // 3. Exclude test code (shared classifier)
  if (isTestPath(file)) return false

  // 4. Exclude the docs-metadata manifest — `defineManifest` source consumed
  //    by gen-docs; zero runtime behavior, stripped from the tarball. Same
  //    "documentation, never grows the error catalog" bucket as README/CHANGELOG.
  if (file.endsWith('/src/manifest.ts')) return false

  return true
}

/** True if ANY file in the list is a sensitive source-code change. */
export function touchesSensitivePaths(files: string[]): boolean {
  return files.some(isSensitiveSourceFile)
}

/**
 * Return the human-readable list of sensitive packages touched (one
 * entry per package whose src/ had a real source-code change). Used in
 * the log line so failure messages name what triggered the gate.
 */
export function sensitivePackagesTouched(files: string[]): string[] {
  const hits = new Set<string>()
  for (const file of files) {
    if (!isSensitiveSourceFile(file)) continue
    for (const pkg of SENSITIVE_PACKAGES) {
      if (file.startsWith(`packages/core/${pkg}/src/`)) {
        hits.add(`packages/core/${pkg}/`)
        break
      }
    }
  }
  return [...hits].sort()
}

/**
 * Count `ERROR_PATTERNS` entries in a snapshot of `diagnose.ts`.
 * Strategy: find the marker, then count `pattern:` keys inside the
 * array literal. Each `ErrorPattern` entry has exactly one `pattern:`
 * key by the type contract `{ pattern; diagnose; }`.
 *
 * Returns -1 if the marker is missing or the array can't be parsed —
 * the caller treats that as a hard fail (the catalog file's shape
 * changed and the script needs updating).
 */
export function countCatalogEntries(source: string): number {
  const start = source.indexOf(CATALOG_MARKER)
  if (start === -1) return -1
  // Walk forward to find the closing `]`. Start AT the `[` (last char
  // of the marker), not after — `source[arrayStart] === '['` is asserted.
  const arrayStart = start + CATALOG_MARKER.length - 1
  if (source[arrayStart] !== '[') return -1
  let depth = 0
  let arrayEnd = -1
  for (let i = arrayStart; i < source.length; i++) {
    const c = source[i]
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        arrayEnd = i
        break
      }
    }
  }
  if (arrayEnd === -1) return -1
  const region = source.slice(arrayStart, arrayEnd)
  const matches = region.match(/^\s*pattern:/gm)
  return matches?.length ?? 0
}

// ─── Side-effecting helpers ─────────────────────────────────────────────────

/**
 * `git diff` / `git show` runner. Uses `execFileSync` (no shell parsing)
 * with discrete argv so even an unexpected character in a sanitized value
 * can't be interpreted as a shell metacharacter — defense in depth on
 * top of the BASE_REF allowlist.
 */
function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function changedFiles(baseRef: string): string[] {
  // `git diff --name-only` requires the merge-base form `<base>...HEAD`
  // to compare only commits unique to HEAD, not the union of both
  // branches' changes since divergence.
  try {
    const out = git('diff', '--name-only', `origin/${baseRef}...HEAD`)
    return out.length === 0 ? [] : out.split('\n')
  } catch {
    return []
  }
}

function readFileAt(ref: string, path: string): string | null {
  try {
    return git('show', `${ref}:${path}`)
  } catch {
    return null
  }
}

function readFileAtHead(path: string): string | null {
  try {
    return git('show', `HEAD:${path}`)
  } catch {
    return null
  }
}

// ─── Main runner ────────────────────────────────────────────────────────────

/**
 * Result of evaluating the gate against a set of inputs. Pure data —
 * the side-effecting runner converts this to console output + exit code.
 */
export type GateResult =
  | { kind: 'skip-no-sensitive-files' }
  | { kind: 'skip-release-pr'; headRef: string }
  | { kind: 'skip-label' }
  | { kind: 'skip-missing-base-catalog' }
  | { kind: 'fail-parse'; baseCount: number; headCount: number }
  | { kind: 'fail-missing-head-catalog' }
  | { kind: 'fail-no-growth'; baseCount: number; headCount: number; touched: string[] }
  | { kind: 'ok'; baseCount: number; headCount: number }

export interface GateInputs {
  files: string[]
  hasSkipLabel: boolean
  headRef: string
  baseSource: string | null
  headSource: string | null
}

/**
 * Pure policy evaluator. All side-effecting reads (git, env) happen in
 * `main()`; the result is computed here from plain data so the unit
 * tests can drive every branch without spawning a subprocess.
 */
export function evaluateGate(inp: GateInputs): GateResult {
  if (!touchesSensitivePaths(inp.files)) {
    return { kind: 'skip-no-sensitive-files' }
  }

  if (inp.headRef.startsWith('changeset-release/')) {
    return { kind: 'skip-release-pr', headRef: inp.headRef }
  }

  if (inp.hasSkipLabel) {
    return { kind: 'skip-label' }
  }

  if (inp.baseSource === null) {
    return { kind: 'skip-missing-base-catalog' }
  }

  if (inp.headSource === null) {
    return { kind: 'fail-missing-head-catalog' }
  }

  const baseCount = countCatalogEntries(inp.baseSource)
  const headCount = countCatalogEntries(inp.headSource)

  if (baseCount < 0 || headCount < 0) {
    return { kind: 'fail-parse', baseCount, headCount }
  }

  if (headCount > baseCount) {
    return { kind: 'ok', baseCount, headCount }
  }

  return {
    kind: 'fail-no-growth',
    baseCount,
    headCount,
    touched: sensitivePackagesTouched(inp.files),
  }
}

/**
 * BASE_REF / HEAD_REF allowlist. Both are supplied by CI from
 * `github.event.pull_request.{base,head}.ref` — attacker-influenceable
 * (a PR can target any base / head branch). Validate against a strict
 * regex before any shell use to close the CodeQL "Indirect uncontrolled
 * command line" finding (a malicious value like `main; rm -rf /` would
 * otherwise reach the shell).
 */
const REF_ALLOWLIST = /^[a-zA-Z0-9._/-]+$/

function main(): void {
  const RAW_BASE_REF = process.env['BASE_REF'] || 'main'
  if (!REF_ALLOWLIST.test(RAW_BASE_REF)) {
    console.error(
      `[check-diagnose-catalog] FAILED — BASE_REF "${RAW_BASE_REF}" contains characters outside the allowed set [a-zA-Z0-9._/-]. Refusing to use it.`,
    )
    process.exit(1)
  }
  const BASE_REF = RAW_BASE_REF

  const RAW_HEAD_REF = process.env['HEAD_REF'] || ''
  const HEAD_REF = REF_ALLOWLIST.test(RAW_HEAD_REF) ? RAW_HEAD_REF : ''
  const HAS_SKIP_LABEL = process.env['HAS_SKIP_LABEL'] === 'true'

  const files = changedFiles(BASE_REF)
  const baseSource = readFileAt(`origin/${BASE_REF}`, CATALOG_FILE)
  const headSource = readFileAtHead(CATALOG_FILE)

  const result = evaluateGate({
    files,
    hasSkipLabel: HAS_SKIP_LABEL,
    headRef: HEAD_REF,
    baseSource,
    headSource,
  })

  switch (result.kind) {
    case 'skip-no-sensitive-files':
      console.log(
        '[check-diagnose-catalog] PR does not touch framework error-surface source files — gate not applicable.',
      )
      process.exit(0)
      break

    case 'skip-release-pr':
      console.log(
        `[check-diagnose-catalog] Branch \`${result.headRef}\` is the changesets-action release PR — auto-skipping the gate (version bumps + CHANGELOGs never grow the error catalog).`,
      )
      process.exit(0)
      break

    case 'skip-label':
      console.log(
        '[check-diagnose-catalog] skip-diagnose-catalog label present — bypassing the gate.',
      )
      process.exit(0)
      break

    case 'skip-missing-base-catalog':
      console.log(
        `[check-diagnose-catalog] Could not read \`${CATALOG_FILE}\` from origin/${BASE_REF} — skipping (likely a first-time-add of the catalog file).`,
      )
      process.exit(0)
      break

    case 'fail-missing-head-catalog':
      console.error(
        `[check-diagnose-catalog] FAILED — \`${CATALOG_FILE}\` not present at HEAD. The catalog must exist for the diagnose tool to work.`,
      )
      process.exit(1)
      break

    case 'fail-parse':
      console.error(
        `[check-diagnose-catalog] FAILED — could not parse ERROR_PATTERNS array (base=${result.baseCount} head=${result.headCount}). The catalog file structure may have changed; update the marker in this script.`,
      )
      process.exit(1)
      break

    case 'ok':
      console.log(
        `[check-diagnose-catalog] OK — catalog grew by ${result.headCount - result.baseCount} entry(s). base=${result.baseCount} → head=${result.headCount}.`,
      )
      process.exit(0)
      break

    case 'fail-no-growth':
      console.error(
        `[check-diagnose-catalog] Sensitive source touched (${result.touched.join(', ')}).`,
      )
      console.error(
        `[check-diagnose-catalog] FAILED — this PR changes framework error-surface source code,`,
      )
      console.error(
        '  but ERROR_PATTERNS did not grow. Every bug fix in a framework subsystem that',
      )
      console.error(
        '  could surface as a user-visible error is an opportunity to teach the diagnose tool.',
      )
      console.error('')
      console.error(
        `Either add a new entry to \`ERROR_PATTERNS\` in \`${CATALOG_FILE}\`:`,
      )
      console.error('')
      console.error('  {')
      console.error("    pattern: /your-error-regex/,")
      console.error("    diagnose: () => ({ cause: '...', fix: '...', fixCode: '...' }),")
      console.error('  },')
      console.error('')
      console.error(
        'Or, if this PR is genuinely catalog-irrelevant (internal refactor / perf-only /',
      )
      console.error(
        "type tightening / docs-only change in core), add the 'skip-diagnose-catalog' label",
      )
      console.error('to bypass.')
      console.error(
        `[check-diagnose-catalog] ERROR_PATTERNS entries: base=${result.baseCount} → head=${result.headCount}.`,
      )
      process.exit(1)
      break
  }
}

// Only run main() when invoked as a script — `import {} from './check-diagnose-catalog'`
// from a test doesn't trigger the runner.
//
// Bun + Node both expose `import.meta.main` (Bun) / `require.main === module` (Node).
// We use `import.meta.url === 'file:///<argv[1]>'`-style detection here because the
// script ships as ESM under `type: module`. Falling back: if `process.argv[1]` ends
// with this filename, run; otherwise the import is from a test and we no-op.
const isScriptInvocation =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-diagnose-catalog.ts')

if (isScriptInvocation) {
  main()
}
