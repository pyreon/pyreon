#!/usr/bin/env bun
/**
 * gen-docs — walk every `packages/[category]/[pkg]/manifest.ts` and regenerate
 * documentation surfaces from the structured manifest data.
 *
 * ## V1 scope
 *
 * - Walks `packages/<category>/<pkg>/manifest.ts` (and `packages/zero/*`
 *   for the zero category).
 * - Regenerates the per-package bullet in `llms.txt` ONLY. The first
 *   pass intentionally targets one surface so the diff against the
 *   hand-written entry is reviewable in isolation.
 * - Replaces any line starting with `- ${manifest.name} —` in-place.
 *   No marker pollution; hand-written lines stay hand-written until
 *   the package ships a manifest.
 *
 * Future PRs will extend coverage to `llms-full.txt`, the MCP
 * `api-reference.generated.ts`, and the CLAUDE.md package table.
 *
 * ## CI enforcement
 *
 * The `Docs Sync` CI job runs `bun run gen-docs` and then
 * `git diff --exit-code` — if the checked-in files drift from the
 * manifests, the job fails and reviewers see the expected fix.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PackageManifest } from '@pyreon/manifest'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '..')
const PACKAGE_CATEGORIES = ['core', 'fundamentals', 'tools', 'ui-system', 'internals', 'zero']

async function findManifests(): Promise<Array<{ path: string; manifest: PackageManifest }>> {
  const found: Array<{ path: string; manifest: PackageManifest }> = []
  for (const category of PACKAGE_CATEGORIES) {
    const categoryDir = join(REPO_ROOT, 'packages', category)
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
        console.warn(`[gen-docs] ${manifestPath} has no default export — skipping`)
        continue
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
function renderLlmsTxtLine(m: PackageManifest): string {
  const peerSuffix =
    m.peerDeps && m.peerDeps.length > 0 ? ` (peer: ${m.peerDeps.join(', ')})` : ''
  const gotchaSuffix = m.gotchas && m.gotchas.length > 0 ? `. ${m.gotchas[0]}` : ''
  return `- ${m.name} — ${m.tagline}${peerSuffix}${gotchaSuffix}`
}

function regenerateLlmsTxt(
  contents: string,
  manifests: Array<{ manifest: PackageManifest }>,
): { contents: string; changedLines: number } {
  let next = contents
  let changedLines = 0
  for (const { manifest } of manifests) {
    const targetLine = renderLlmsTxtLine(manifest)
    // Match any line starting with the package's bullet prefix. Preserves
    // the file's overall ordering; only touches the one relevant line.
    const bulletPrefix = `- ${manifest.name} —`
    const escaped = bulletPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${escaped}.*$`, 'm')
    if (!re.test(next)) {
      console.warn(
        `[gen-docs] llms.txt: no line starting with "${bulletPrefix}" — manifest exists but entry missing. Append manually or leave for a follow-up.`,
      )
      continue
    }
    const prev = next
    next = next.replace(re, targetLine)
    if (prev !== next) changedLines++
  }
  return { contents: next, changedLines }
}

async function main() {
  const manifests = await findManifests()
  console.log(
    `[gen-docs] found ${manifests.length} manifest${manifests.length === 1 ? '' : 's'}`,
  )
  if (manifests.length === 0) {
    console.log('[gen-docs] no manifests found — nothing to regenerate')
    return
  }

  // llms.txt
  const llmsTxtPath = join(REPO_ROOT, 'llms.txt')
  const before = readFileSync(llmsTxtPath, 'utf8')
  const { contents: after, changedLines } = regenerateLlmsTxt(before, manifests)
  if (before !== after) {
    writeFileSync(llmsTxtPath, after)
    console.log(
      `[gen-docs] llms.txt: ${changedLines} line${changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else {
    console.log(`[gen-docs] llms.txt: no changes (already in sync)`)
  }
}

await main()
