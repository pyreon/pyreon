#!/usr/bin/env bun
/**
 * gen-docs — walk every manifest.ts across the monorepo and regenerate
 * documentation surfaces from the structured manifest data.
 *
 * ## V1 scope
 *
 * - Walks `packages/[category]/[pkg]/manifest.ts` (and `packages/zero/*`
 *   for the zero category).
 * - Regenerates the per-package bullet in `llms.txt` ONLY. The first
 *   pass intentionally targets one surface so the diff against the
 *   hand-written entry is reviewable in isolation.
 * - Replaces any line starting with `- <manifest.name> —` in-place.
 *   No marker pollution; hand-written lines stay hand-written until
 *   the package ships a manifest.
 *
 * Future PRs will extend coverage to `llms-full.txt`, the MCP
 * `api-reference.generated.ts`, and the CLAUDE.md package table.
 *
 * ## CLI
 *
 * - `bun run gen-docs` — regenerate in-place.
 * - `bun run gen-docs --check` — exit 0 if in sync, 1 if any file would
 *   change. Local equivalent of the CI `Docs Sync` gate.
 *
 * ## CI enforcement
 *
 * The `Docs Sync` CI job runs the generator and then
 * `git diff --exit-code` — if the checked-in files drift from the
 * manifests, the job fails and reviewers see the expected fix.
 *
 * ## Rollback / override
 *
 * If a bug in this script blocks an urgent merge, a repo admin can
 * temporarily remove `Docs Sync` from the required-checks list in
 * branch protection settings. File a follow-up to fix the generator
 * and restore the check. Do not bypass by hand-editing generated
 * lines — the next gen-docs run will revert those edits silently.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// Relative import (not `@pyreon/manifest`) because this script runs
// outside any package — bun resolves workspace specifiers from a
// package's node_modules, and scripts/ has none. Type-only.
import type { PackageManifest } from '../packages/internals/manifest/src/types'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '..')
const PACKAGE_CATEGORIES = ['core', 'fundamentals', 'tools', 'ui-system', 'internals', 'zero']

export interface LoadedManifest {
  path: string
  manifest: PackageManifest
}

export async function findManifests(repoRoot: string = REPO_ROOT): Promise<LoadedManifest[]> {
  const found: LoadedManifest[] = []
  for (const category of PACKAGE_CATEGORIES) {
    const categoryDir = join(repoRoot, 'packages', category)
    let pkgs: string[]
    try {
      pkgs = readdirSync(categoryDir)
    } catch {
      continue
    }
    for (const pkg of pkgs) {
      const pkgDir = join(categoryDir, pkg)
      try {
        if (!statSync(pkgDir).isDirectory()) continue
      } catch {
        continue
      }
      const manifestPath = join(pkgDir, 'manifest.ts')
      try {
        if (!statSync(manifestPath).isFile()) continue
      } catch {
        continue
      }
      const mod = (await import(pathToFileURL(manifestPath).href)) as {
        default?: PackageManifest
      }
      if (!mod.default) {
        throw new Error(`[gen-docs] ${manifestPath} has no default export`)
      }
      found.push({ path: manifestPath, manifest: mod.default })
    }
  }
  return found
}

/**
 * Render a manifest to its one-line `llms.txt` bullet form. Compact by
 * design — the full structured expansion lives in `llms-full.txt`
 * (follow-up PR). Includes peerDeps inline when present and the first
 * `gotcha` as a teaser so the one-liner retains meaningful density.
 */
export function renderLlmsTxtLine(m: PackageManifest): string {
  const peerSuffix =
    m.peerDeps && m.peerDeps.length > 0 ? ` (peer: ${m.peerDeps.join(', ')})` : ''
  const gotchaSuffix = m.gotchas && m.gotchas.length > 0 ? `. ${m.gotchas[0]}` : ''
  return `- ${m.name} — ${m.tagline}${peerSuffix}${gotchaSuffix}`
}

export interface RegenerateResult {
  contents: string
  changedLines: number
  missingEntries: string[]
}

/**
 * Replace existing `- <name> —` bullets in llms.txt with regenerated
 * content from the manifests. Returns the list of manifest names whose
 * bullet line could NOT be found in llms.txt — the caller should treat
 * this as a hard error (manifests without a landing line produce
 * silent no-ops that drift untracked).
 */
export function regenerateLlmsTxt(
  contents: string,
  manifests: LoadedManifest[],
): RegenerateResult {
  let next = contents
  let changedLines = 0
  const missingEntries: string[] = []
  for (const { manifest } of manifests) {
    const targetLine = renderLlmsTxtLine(manifest)
    const bulletPrefix = `- ${manifest.name} —`
    const escaped = bulletPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${escaped}.*$`, 'm')
    if (!re.test(next)) {
      missingEntries.push(manifest.name)
      continue
    }
    const prev = next
    next = next.replace(re, targetLine)
    if (prev !== next) changedLines++
  }
  return { contents: next, changedLines, missingEntries }
}

async function main() {
  const check = process.argv.includes('--check')
  const manifests = await findManifests()
  if (!check) {
    console.log(
      `[gen-docs] found ${manifests.length} manifest${manifests.length === 1 ? '' : 's'}`,
    )
  }
  if (manifests.length === 0) {
    if (!check) console.log('[gen-docs] no manifests found — nothing to regenerate')
    return
  }

  const llmsTxtPath = join(REPO_ROOT, 'llms.txt')
  const before = readFileSync(llmsTxtPath, 'utf8')
  const { contents: after, changedLines, missingEntries } = regenerateLlmsTxt(
    before,
    manifests,
  )

  if (missingEntries.length > 0) {
    console.error(
      `[gen-docs] ERROR: these manifests have no matching bullet in llms.txt (expected a line starting with "- <name> —"):\n` +
        missingEntries.map((n) => `  - ${n}`).join('\n') +
        `\nAdd the bullet by hand first, then re-run gen-docs.`,
    )
    process.exit(1)
  }

  if (before !== after) {
    if (check) {
      console.error(
        '[gen-docs] llms.txt is out of sync with manifests. Run `bun run gen-docs` and commit the result.',
      )
      process.exit(1)
    }
    writeFileSync(llmsTxtPath, after)
    console.log(
      `[gen-docs] llms.txt: ${changedLines} line${changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else if (!check) {
    console.log(`[gen-docs] llms.txt: no changes (already in sync)`)
  }
}

// Only run when executed directly — not when imported by tests.
if (import.meta.main) {
  await main()
}
