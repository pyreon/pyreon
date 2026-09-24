#!/usr/bin/env bun
/**
 * Gate: a `@pyreon/zero` changeset that bumps `minor` — which is how Pyreon
 * spells a BREAKING change while it is 0.x — must say how users get across
 * it. One line in the changeset body:
 *
 *   Upgrade: none                          — not breaking (a feature or fix)
 *   Upgrade: codemod <id>                  — `pyreon upgrade` migrates it;
 *                                            <id> must exist in the CLI's
 *                                            codemod registry
 *   Upgrade: manual — <reason, ≥ 20 chars> — no safe mechanical migration;
 *                                            the reason says what to do
 *
 * The point is not bureaucracy: it forces the question "can a codemod do
 * this?" at the moment the author understands the change best, and records
 * the answer where the release notes are generated from.
 *
 * Only changesets ADDED relative to `origin/<BASE_REF>` (default `main`) are
 * checked, so the rule applies to new work. A missing base ref fails in CI
 * (never "nothing changed") and skips loudly locally.
 *
 *   bun scripts/check-breaking-changeset-codemod.ts
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CODEMODS } from '../packages/tools/cli/src/codemods'

/** Packages whose `minor` bumps need an `Upgrade:` declaration. */
export const GATED_PACKAGES = new Set(['@pyreon/zero'])

const root = (): string => fileURLToPath(new URL('..', import.meta.url))

/** `{ package: bump }` from a changeset's frontmatter. */
export function changesetBumps(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of (m[1] as string).split(/\r?\n/)) {
    const kv = /^\s*['"]?([^'":]+)['"]?\s*:\s*(\w+)\s*$/.exec(line)
    if (kv) out[kv[1] as string] = kv[2] as string
  }
  return out
}

/**
 * Problems with one changeset. `codemods` maps a registry id to the package
 * it migrates.
 */
export function changesetProblems(file: string, text: string, codemods: Map<string, string>): string[] {
  const bumps = changesetBumps(text)
  const gated = Object.entries(bumps).filter(([pkg, bump]) => GATED_PACKAGES.has(pkg) && bump === 'minor')
  if (gated.length === 0) return []
  const body = text.replace(/^---[\s\S]*?\n---/, '')
  const lines = body.split(/\r?\n/).filter((l) => /^\s*Upgrade\s*:/i.test(l))
  const pkgs = gated.map(([p]) => p).join(', ')
  const how =
    'Add one line: `Upgrade: none` (not breaking), `Upgrade: codemod <id>` (a codemod in ' +
    'packages/tools/cli/src/codemods), or `Upgrade: manual — <what users must change>`.'
  if (lines.length === 0) return [`${file}: minor bump of ${pkgs} has no "Upgrade:" line. ${how}`]
  if (lines.length > 1) return [`${file}: more than one "Upgrade:" line — keep exactly one.`]
  const value = (lines[0] as string).replace(/^\s*Upgrade\s*:\s*/i, '').trim()
  if (/^none$/i.test(value)) return []
  const cm = /^codemod\s+([a-z0-9-]+)\s*$/i.exec(value)
  if (cm) {
    const id = cm[1] as string
    const pkg = codemods.get(id)
    if (pkg === undefined) return [`${file}: codemod "${id}" is not in the registry (packages/tools/cli/src/codemods).`]
    if (!gated.some(([p]) => p === pkg)) return [`${file}: codemod "${id}" migrates ${pkg}, not ${pkgs}.`]
    return []
  }
  const manual = /^manual\s*[—–-]\s*(.+)$/i.exec(value)
  if (manual) {
    return (manual[1] as string).trim().length >= 20
      ? []
      : [`${file}: "Upgrade: manual — …" needs a reason of at least 20 characters saying what users must change.`]
  }
  return [`${file}: unrecognised "Upgrade: ${value}". ${how}`]
}

function addedChangesets(baseRef: string): string[] | 'no-ref' {
  const ref = spawnSync('git', ['rev-parse', '--verify', '--quiet', `origin/${baseRef}`], { cwd: root() })
  if (ref.status !== 0) return 'no-ref'
  const r = spawnSync(
    'git',
    ['diff', '--name-only', '--no-renames', '--diff-filter=A', `origin/${baseRef}...HEAD`, '--', '.changeset'],
    { cwd: root(), encoding: 'utf-8' },
  )
  if (r.status !== 0) return 'no-ref'
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => f.endsWith('.md') && !f.endsWith('README.md'))
}

function main(): void {
  const baseRef = process.env['BASE_REF'] || 'main'
  if (!/^[a-zA-Z0-9._/-]+$/.test(baseRef)) {
    console.error(`[check-breaking-changeset-codemod] refusing BASE_REF "${baseRef}"`)
    process.exit(1)
  }
  const files = addedChangesets(baseRef)
  if (files === 'no-ref') {
    if (process.env['CI']) {
      console.error(`[check-breaking-changeset-codemod] origin/${baseRef} is unavailable — cannot tell which changesets are new`)
      process.exit(1)
    }
    console.warn(`[check-breaking-changeset-codemod] SKIPPED: no origin/${baseRef} ref in this clone.`)
    return
  }
  const codemods = new Map(CODEMODS.map((c) => [c.id, c.package as string]))
  const problems = files.flatMap((f) => changesetProblems(f, readFileSync(join(root(), f), 'utf-8'), codemods))
  if (problems.length > 0) {
    console.error('[check-breaking-changeset-codemod] a breaking zero changeset must say how users upgrade:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log(`[check-breaking-changeset-codemod] ✓ ${files.length} new changeset(s) checked`)
}

if (import.meta.main) main()
