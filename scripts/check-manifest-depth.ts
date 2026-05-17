#!/usr/bin/env bun
/**
 * check-manifest-depth — ratchet gate on package-manifest API density.
 *
 * The root cause behind "`get_api` returns a signature but no foot-gun
 * catalog for half the fundamentals" was that NOTHING enforced manifest
 * depth. A package could ship a manifest with 3 api[] entries for 37
 * functions (rx, pre-PR) or reference `StoreApi` 3× in `seeAlso` with
 * no entry at all (store, pre-PR) and no gate noticed — the MCP
 * `get_api` tool just 404'd or returned thin content to agents.
 *
 * This is NOT an arbitrary ratio threshold (brittle, debatable). It's a
 * concrete RATCHET, same shape as `check-bundle-budgets` /
 * audit-types `EXEMPT_FIELDS`: each LOCKED package records the floor it
 * has reached — `{ minEntries, minWithMistakes }`. The gate fails if a
 * package drops below its floor. It cannot regress; it does not impose
 * a number nobody agreed to; and it stays silent on not-yet-migrated
 * packages (they're simply absent from LOCKED — the visible TODO list).
 *
 * Migrating a package to MCP density = enrich its manifest, then add it
 * to LOCKED with its achieved numbers. That addition is the deliberate
 * "this is at standard now" signal, reviewed in the same PR.
 *
 * Run:
 *   bun run check-manifest-depth          # exit non-zero on regression
 *   bun run check-manifest-depth --json   # machine-readable
 */

// Scripts import the internal manifest package by relative path, not
// the `@pyreon/manifest` specifier (it isn't resolvable from scripts/
// via bun). Mirrors scripts/gen-docs-core.ts.
import { resolve } from 'node:path'
import { findManifests } from '../packages/internals/manifest/src'

const REPO_ROOT = resolve(import.meta.dir, '..')

/**
 * The floor each migrated package must stay at or above. Values are the
 * numbers achieved at migration time (NOT aspirational) so the gate is
 * "don't go below where we are", never "hit a target nobody met".
 *
 *   minEntries        — api[] entry count
 *   minWithMistakes   — api[] entries carrying a non-empty mistakes[]
 *
 * Add a package here ONLY in the PR that brings it to density, with the
 * numbers that PR achieves. Packages absent from this map are the
 * remaining migration backlog (i18n, charts, code, dnd, state-tree,
 * validation, …) — intentionally NOT gated yet so this stays a ratchet,
 * not a flag-day that fails CI on 15 packages at once.
 */
const LOCKED: Record<string, { minEntries: number; minWithMistakes: number }> = {
  // Brought to MCP density in the manifest-depth PR (store + rx),
  // grounded in real source — including correcting 4 rx inaccuracies
  // and filling the store `StoreApi` get_api 404.
  '@pyreon/store': { minEntries: 6, minWithMistakes: 6 },
  '@pyreon/rx': { minEntries: 9, minWithMistakes: 9 },
  // Already at density before this PR — locked so they can't silently
  // erode. Numbers are the authoritative `findManifests` api[] counts
  // (the same loader `get_api` uses), not a source grep.
  '@pyreon/query': { minEntries: 16, minWithMistakes: 11 },
  '@pyreon/form': { minEntries: 7, minWithMistakes: 7 },
}

interface Finding {
  pkg: string
  entries: number
  withMistakes: number
  floor: { minEntries: number; minWithMistakes: number }
}

async function run(): Promise<{ ok: boolean; findings: Finding[]; checked: number }> {
  const manifests = await findManifests(REPO_ROOT)
  const byName = new Map(manifests.map((m) => [m.manifest.name, m.manifest]))
  const findings: Finding[] = []

  for (const [pkg, floor] of Object.entries(LOCKED)) {
    const manifest = byName.get(pkg)
    if (!manifest) {
      // A LOCKED package whose manifest vanished is itself a regression.
      findings.push({ pkg, entries: 0, withMistakes: 0, floor })
      continue
    }
    const api = (manifest.api ?? []) as Array<{ mistakes?: unknown[] }>
    const entries = api.length
    const withMistakes = api.filter(
      (e) => Array.isArray(e.mistakes) && e.mistakes.length > 0,
    ).length
    if (entries < floor.minEntries || withMistakes < floor.minWithMistakes) {
      findings.push({ pkg, entries, withMistakes, floor })
    }
  }
  return { ok: findings.length === 0, findings, checked: Object.keys(LOCKED).length }
}

const json = process.argv.includes('--json')
const result = await run()

if (json) {
  console.log(JSON.stringify(result, null, 2))
} else if (result.ok) {
  console.log(
    `✓ Manifest depth ratchet: all ${result.checked} locked package(s) at or above their density floor.`,
  )
} else {
  console.error(`✗ ${result.findings.length} package(s) BELOW their manifest-depth floor:\n`)
  for (const f of result.findings) {
    console.error(`  ${f.pkg}`)
    console.error(
      `    entries: ${f.entries} (floor ${f.floor.minEntries})  withMistakes: ${f.withMistakes} (floor ${f.floor.minWithMistakes})`,
    )
    console.error(
      `    A locked package's manifest density regressed. Restore the lost api[] entries / mistakes[],`,
    )
    console.error(
      `    or — if entries were intentionally removed — lower the floor in scripts/check-manifest-depth.ts`,
    )
    console.error(`    and justify it in the PR description.\n`)
  }
}

if (!result.ok) process.exit(1)
