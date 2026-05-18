#!/usr/bin/env bun
/**
 * bootstrap-native-publish — one-time helper to bring the 7
 * `@pyreon/compiler-<triple>` platform packages into existence on npm.
 *
 * WHY THIS EXISTS: npm trusted publishing (OIDC) is configured on a
 * package's OWN settings page and CANNOT be set up for a package that
 * has never been published (npm has no account/org-level
 * pre-registration). `release-native.yml` therefore can't bootstrap the
 * 7 packages itself — they must be manually published ONCE, after which
 * trusted publishing is configured per-package and every later release
 * is fully automated via OIDC. See CONTRIBUTING.md → "Native binary
 * publishing".
 *
 * WHAT THIS DOES: takes the directory of artifacts downloaded from a
 * `release-native.yml` run (Actions → Run workflow → publish:false),
 * locates each `pyreon-compiler-<triple>.node`, copies it into the
 * matching stub package as `pyreon-compiler.node`, runs the same
 * >100 KB sanity check the workflow uses, and PRINTS the exact manual
 * publish command for each. It deliberately does NOT publish — you run
 * the printed commands yourself after `npm whoami` confirms the right
 * account.
 *
 * Usage:
 *   bun scripts/bootstrap-native-publish.ts <downloaded-artifacts-dir>
 */

import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')
const STUB_ROOT = join(REPO_ROOT, 'packages/core/compiler/npm')
const MIN_BYTES = 100_000

// Rust target triple → stub short name (the `npm/<short>/` dir + the
// loader's getPlatformPackageName() output). Mirrors the matrix in
// .github/workflows/release-native.yml — keep in sync if that changes.
const TRIPLE_TO_SHORT: Record<string, string> = {
  'aarch64-apple-darwin': 'darwin-arm64',
  'x86_64-apple-darwin': 'darwin-x64',
  'x86_64-unknown-linux-gnu': 'linux-x64-gnu',
  'aarch64-unknown-linux-gnu': 'linux-arm64-gnu',
  'x86_64-unknown-linux-musl': 'linux-x64-musl',
  'aarch64-unknown-linux-musl': 'linux-arm64-musl',
  'x86_64-pc-windows-msvc': 'win32-x64-msvc',
}

const artifactsDir = process.argv[2]
if (!artifactsDir) {
  console.error(
    'Usage: bun scripts/bootstrap-native-publish.ts <downloaded-artifacts-dir>',
  )
  process.exit(2)
}
const artifactsRoot = resolve(artifactsDir)
if (!existsSync(artifactsRoot)) {
  console.error(`[bootstrap-native] artifacts dir not found: ${artifactsRoot}`)
  process.exit(2)
}

/** Recursively find the first file named exactly `name` under `dir`. */
function findFile(dir: string, name: string): string | null {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  for (const e of entries) {
    const full = join(dir, e)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      const hit = findFile(full, name)
      if (hit) return hit
    } else if (e === name) {
      return full
    }
  }
  return null
}

interface Staged {
  short: string
  pkg: string
  bytes: number
}

const staged: Staged[] = []
const failures: string[] = []

for (const [triple, short] of Object.entries(TRIPLE_TO_SHORT)) {
  const artifactName = `pyreon-compiler-${triple}.node`
  const src = findFile(artifactsRoot, artifactName)
  const stubDir = join(STUB_ROOT, short)
  const dest = join(stubDir, 'pyreon-compiler.node')

  if (!existsSync(stubDir)) {
    failures.push(`${short}: stub dir missing (${stubDir})`)
    continue
  }
  if (!src) {
    failures.push(`${short}: artifact ${artifactName} not found under ${artifactsRoot}`)
    continue
  }
  const bytes = statSync(src).size
  if (bytes < MIN_BYTES) {
    failures.push(`${short}: ${artifactName} is ${bytes} B (< ${MIN_BYTES}) — likely corrupted`)
    continue
  }
  copyFileSync(src, dest)
  staged.push({ short, pkg: `@pyreon/compiler-${short}`, bytes })
}

console.log('\n[bootstrap-native] staged binaries:')
for (const s of staged) {
  console.log(`  ✓ ${s.pkg.padEnd(34)} ${(s.bytes / 1024).toFixed(0)} KB`)
}
if (failures.length > 0) {
  console.error('\n[bootstrap-native] PROBLEMS (fix before publishing):')
  for (const f of failures) console.error(`  ✗ ${f}`)
}

if (staged.length === 0) {
  console.error('\n[bootstrap-native] nothing staged — aborting.')
  process.exit(1)
}

console.log(`
[bootstrap-native] NEXT — publish manually (this script does NOT publish):

  1. Confirm the account:   npm whoami     # must have @pyreon publish rights
  2. Run each command below (no --provenance: it requires the OIDC CI
     runtime and fails on a local publish):
`)
for (const s of staged) {
  console.log(
    `  ( cd "packages/core/compiler/npm/${s.short}" && npm publish --access public )`,
  )
}
console.log(`
  3. Then configure trusted publishing for EACH now-existing package:
     npmjs.com → Packages → <pkg> → Settings → Trusted publishing → Add
       Repository: pyreon/pyreon   Workflow: release-native.yml   Environment: (blank)

  After that, every future v*.*.* tag publishes all 7 via OIDC
  automatically — this bootstrap runs exactly once.
`)

if (failures.length > 0) process.exit(1)
