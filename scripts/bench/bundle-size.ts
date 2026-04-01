/**
 * Bundle size tracking — measures gzipped sizes of key Pyreon packages.
 *
 * Uses esbuild to bundle each package entry point as ESM, then gzip -9
 * to measure compressed transfer size. Reports both raw and gzipped bytes.
 *
 * Usage: bun scripts/bench/bundle-size.ts
 * Output: JSON to stdout when --json flag is passed, otherwise table to stdout
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import * as esbuild from 'esbuild'

const ROOT = resolve(import.meta.dir, '../..')
const JSON_MODE = process.argv.includes('--json')

interface SizeEntry {
  package: string
  entry: string
  raw: number
  gzipped: number
}

interface SizeOutput {
  timestamp: string
  commit: string
  sizes: Record<string, { raw: number; gzipped: number }>
}

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)}MB`
}

// ─── Packages to measure ────────────────────────────────────────────────────

const PACKAGES: { name: string; entry: string }[] = [
  { name: '@pyreon/reactivity', entry: 'packages/core/reactivity/src/index.ts' },
  { name: '@pyreon/core', entry: 'packages/core/core/src/index.ts' },
  { name: '@pyreon/runtime-dom', entry: 'packages/core/runtime-dom/src/index.ts' },
  { name: '@pyreon/compiler', entry: 'packages/core/compiler/src/index.ts' },
  { name: '@pyreon/router', entry: 'packages/core/router/src/index.ts' },
]

// ─── Bundle + measure ───────────────────────────────────────────────────────

async function measurePackage(pkg: { name: string; entry: string }): Promise<SizeEntry> {
  const entryPath = resolve(ROOT, pkg.entry)
  const tmpDir = mkdtempSync(join(tmpdir(), 'pyreon-bench-'))
  const outFile = join(tmpDir, 'bundle.js')

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      outfile: outFile,
      minify: true,
      treeShaking: true,
      // Mark all external deps (node builtins, third-party)
      external: ['node:*', 'bun:*'],
      // Resolve workspace packages using bun condition
      conditions: ['bun'],
      logLevel: 'silent',
    })

    const raw = readFileSync(outFile)
    const gzipped = gzipSync(raw, { level: 9 })

    return {
      package: pkg.name,
      entry: pkg.entry,
      raw: raw.length,
      gzipped: gzipped.length,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[bundle-size] Failed to bundle ${pkg.name}: ${msg}`)
    return {
      package: pkg.name,
      entry: pkg.entry,
      raw: 0,
      gzipped: 0,
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const entries: SizeEntry[] = []

for (const pkg of PACKAGES) {
  const entry = await measurePackage(pkg)
  entries.push(entry)
}

if (JSON_MODE) {
  const sizes: Record<string, { raw: number; gzipped: number }> = {}
  for (const e of entries) {
    sizes[e.package] = { raw: e.raw, gzipped: e.gzipped }
  }

  const output: SizeOutput = {
    timestamp: new Date().toISOString(),
    commit: getCommitHash(),
    sizes,
  }

  console.log(JSON.stringify(output, null, 2))
} else {
  console.log('Bundle Size Report')
  console.log(`${'='.repeat(66)}`)
  console.log(
    `${'Package'.padEnd(28)}${'Raw'.padStart(12)}${'Gzipped'.padStart(12)}${'Entry'.padStart(14)}`,
  )
  console.log('-'.repeat(66))

  for (const e of entries) {
    const entryShort = e.entry.replace('packages/', '').replace('/src/index.ts', '')
    console.log(
      `${e.package.padEnd(28)}${formatBytes(e.raw).padStart(12)}${formatBytes(e.gzipped).padStart(12)}${entryShort.padStart(14)}`,
    )
  }

  console.log()
}
