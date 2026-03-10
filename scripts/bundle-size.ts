#!/usr/bin/env bun
/**
 * Bundle size tracker — measures the minified + gzipped size of each Pyreon package.
 *
 * Usage:
 *   bun run scripts/bundle-size.ts          # table output
 *   bun run scripts/bundle-size.ts --json   # JSON output (for CI)
 *
 * How it works:
 *   1. For each package with a src/index.ts, runs Bun's bundler with minification
 *   2. Measures raw, gzip, and brotli sizes
 *   3. Optionally compares against a saved baseline (scripts/bundle-baseline.json)
 */

import { readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { gzipSync } from "node:zlib"

const ROOT = resolve(import.meta.dir, "..")
const PACKAGES_DIR = join(ROOT, "packages")
const BASELINE_PATH = join(ROOT, "scripts", "bundle-baseline.json")

interface PackageSize {
  name: string
  raw: number
  gzip: number
  brotli: number
}

interface Baseline {
  date: string
  packages: PackageSize[]
}

// ── Bundling ─────────────────────────────────────────────────────────────────

async function bundlePackage(pkgDir: string, pkgName: string): Promise<PackageSize | null> {
  const entry = join(pkgDir, "src", "index.ts")
  const exists = await Bun.file(entry).exists()
  if (!exists) return null

  try {
    const result = await Bun.build({
      entrypoints: [entry],
      minify: true,
      target: "browser",
      external: [
        // Externalize all workspace packages so we measure only this package's code
        "@pyreon/*",
        // Externalize Node.js built-ins
        "node:*",
        "node:async_hooks",
        "node:fs",
        "node:fs/promises",
        "node:path",
      ],
    })

    if (!result.success) {
      console.error(`  ✗ ${pkgName}: build failed`)
      for (const log of result.logs) console.error(`    ${log}`)
      return null
    }

    const output = result.outputs[0]
    if (!output) return null

    const code = await output.text()
    const raw = Buffer.byteLength(code, "utf-8")
    const gzipped = gzipSync(code, { level: 9 })
    // Brotli via zlib
    let brotliSize: number
    try {
      const { brotliCompressSync } = await import("node:zlib")
      brotliSize = brotliCompressSync(code).byteLength
    } catch {
      brotliSize = 0
    }

    return { name: pkgName, raw, gzip: gzipped.byteLength, brotli: brotliSize }
  } catch (err) {
    console.error(`  ✗ ${pkgName}: ${err}`)
    return null
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} kB`
}

function delta(current: number, baseline: number): string {
  if (baseline === 0) return ""
  const diff = current - baseline
  const pct = ((diff / baseline) * 100).toFixed(1)
  if (diff > 0) return ` (+${formatBytes(diff)}, +${pct}%)`
  if (diff < 0) return ` (${formatBytes(diff)}, ${pct}%)`
  return " (=)"
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const jsonMode = args.includes("--json")
  const saveBaseline = args.includes("--save")

  // Discover packages
  const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })
  const pkgDirs = dirs
    .filter((d) => d.isDirectory())
    .map((d) => ({ dir: join(PACKAGES_DIR, d.name), name: `@pyreon/${d.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Load baseline for comparison
  let baseline: Baseline | null = null
  try {
    const raw = await readFile(BASELINE_PATH, "utf-8")
    baseline = JSON.parse(raw) as Baseline
  } catch {
    // No baseline yet
  }
  const baselineMap = new Map(baseline?.packages.map((p) => [p.name, p]) ?? [])

  // Bundle all packages
  const results: PackageSize[] = []
  for (const pkg of pkgDirs) {
    const size = await bundlePackage(pkg.dir, pkg.name)
    if (size) results.push(size)
  }

  if (jsonMode) {
    const output: Baseline = { date: new Date().toISOString(), packages: results }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  // Table output
  console.log("")
  console.log("  Pyreon Framework — Bundle Sizes")
  console.log("  ═══════════════════════════════════════════════════════════════")
  console.log(
    `  ${"Package".padEnd(25)} ${"Raw".padStart(10)} ${"Gzip".padStart(10)} ${"Brotli".padStart(10)}`,
  )
  console.log("  " + "─".repeat(63))

  let totalRaw = 0
  let totalGzip = 0
  let totalBrotli = 0

  for (const pkg of results) {
    const bl = baselineMap.get(pkg.name)
    const gzDelta = bl ? delta(pkg.gzip, bl.gzip) : ""

    console.log(
      `  ${pkg.name.padEnd(25)} ${formatBytes(pkg.raw).padStart(10)} ${formatBytes(pkg.gzip).padStart(10)} ${formatBytes(pkg.brotli).padStart(10)}${gzDelta}`,
    )
    totalRaw += pkg.raw
    totalGzip += pkg.gzip
    totalBrotli += pkg.brotli
  }

  console.log("  " + "─".repeat(63))
  console.log(
    `  ${"TOTAL".padEnd(25)} ${formatBytes(totalRaw).padStart(10)} ${formatBytes(totalGzip).padStart(10)} ${formatBytes(totalBrotli).padStart(10)}`,
  )
  console.log("")

  // Save baseline
  if (saveBaseline) {
    const output: Baseline = { date: new Date().toISOString(), packages: results }
    await writeFile(BASELINE_PATH, JSON.stringify(output, null, 2))
    console.log(`  ✓ Baseline saved to ${BASELINE_PATH}`)
    console.log("")
  }
}

main().catch(console.error)
