#!/usr/bin/env bun
/**
 * Migrate internal @pyreon/* peerDependencies → regular dependencies.
 *
 * Why: changesets' peer-major-promotion rule (`shouldBumpMajor` in
 * @changesets/assemble-release-plan) fires on any peerDep dependent
 * whose version range no longer satisfies the new bumped version.
 * In 0.x with workspace:^ (publishes as ^0.X.0), every minor bump
 * leaves the caret range — so every minor bump cascades to MAJOR
 * across the entire fixed group. Result: 0.15.0 + minor changeset →
 * 1.0.0 for everything (we hit this on PR #558).
 *
 * Convention: internal monorepo packages typically use regular
 * `dependencies`, not `peerDependencies`. peerDeps are for external
 * host APIs (host framework, plugin contracts). Pyreon's internal
 * package graph isn't peer-shaped — `rocketstyle` doesn't WORK without
 * `styler`; the user can't substitute their own. Move them to deps.
 *
 * What this script does (per package.json under packages/):
 *   1. Collect peerDeps with name starting `@pyreon/`
 *   2. Merge them into `dependencies`. If already present in deps,
 *      keep the dep entry (deps wins — never duplicate).
 *   3. Remove from peerDependencies.
 *   4. If peerDependencies becomes empty, delete the field entirely.
 *
 * Public peerDeps (non-@pyreon/* — like `react`, `vue`, `@codemirror/*`)
 * stay untouched. Those ARE real peer contracts.
 *
 * One-shot migration script — keep around as documentation of the
 * conversion. Future packages should declare internal deps as
 * `dependencies` from the start.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const PACKAGES_DIR = join(import.meta.dirname, '..', 'packages')

async function* walkPackageJsons(root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === 'dist') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walkPackageJsons(path)
    } else if (entry.name === 'package.json') {
      yield path
    }
  }
}

let modified = 0
const changes: Array<{ path: string; moved: string[] }> = []

for await (const pkgPath of walkPackageJsons(PACKAGES_DIR)) {
  const raw = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(raw)
  const peers = pkg.peerDependencies as Record<string, string> | undefined
  if (!peers) continue

  const internal = Object.keys(peers).filter((name) => name.startsWith('@pyreon/'))
  if (internal.length === 0) continue

  pkg.dependencies = pkg.dependencies ?? {}
  for (const name of internal) {
    if (!(name in pkg.dependencies)) {
      pkg.dependencies[name] = peers[name]!
    }
    delete peers[name]
  }
  if (Object.keys(peers).length === 0) {
    delete pkg.peerDependencies
  }

  // Sort keys in `dependencies` for deterministic output.
  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  )

  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  modified++
  changes.push({ path: pkgPath, moved: internal })
}

console.log(`Modified ${modified} package.json files.\n`)
for (const { path, moved } of changes) {
  const short = path.replace(`${PACKAGES_DIR}/`, '')
  console.log(`  ${short}: moved ${moved.length} peer→dep (${moved.join(', ')})`)
}
