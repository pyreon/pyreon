#!/usr/bin/env bun
/**
 * One-shot codebase audit. Runs against every package under `packages/` and
 * collects the metrics worth eyeballing when the question is "what should we
 * keep, what should we merge, what should we archive."
 *
 * Output: a single TSV-style table to stdout. Pipe into a markdown formatter
 * or stash on disk for the audit doc.
 *
 * Metrics per package:
 *   - srcLoc            — total LOC across src/ (excluding tests)
 *   - testLoc           — total LOC across test files (.test.ts / .test.tsx / __tests__)
 *   - testRatio         — testLoc / srcLoc (engineering investment per LOC)
 *   - exports           — top-level exported identifiers from public entry
 *   - libSize           — total size of compiled lib/ in bytes (0 if not built)
 *   - depCount          — internal package deps (workspace:*)
 *   - extConsumers      — count of files outside the package that import it
 *   - exampleConsumers  — subset of extConsumers that live under examples/
 *   - fixCommits6mo     — git log fix:/perf:/chore: commits touching this package in 180 days
 *   - lastFixDays       — days since last fix-shaped commit (or '-' if never)
 *
 * Heuristics, not gospel. The output is a starting point for a human review.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGES_ROOT = join(ROOT, 'packages')
const NOW = Date.now()

interface PackageInfo {
  name: string
  category: string
  path: string
  pkgJson: Record<string, any>
}

interface Audit {
  name: string
  category: string
  srcLoc: number
  testLoc: number
  testRatio: number
  exports: number
  libSize: number
  depCount: number
  extConsumers: number
  exampleConsumers: number
  fixCommits6mo: number
  lastFixDays: number | null
}

function findPackages(): PackageInfo[] {
  const result: PackageInfo[] = []
  for (const category of readdirSync(PACKAGES_ROOT)) {
    const cp = join(PACKAGES_ROOT, category)
    if (!statSync(cp).isDirectory()) continue
    for (const pkg of readdirSync(cp)) {
      const pp = join(cp, pkg)
      if (!statSync(pp).isDirectory()) continue
      const pj = join(pp, 'package.json')
      if (!existsSync(pj)) continue
      const json = JSON.parse(readFileSync(pj, 'utf-8'))
      result.push({ name: json.name, category, path: pp, pkgJson: json })
    }
  }
  return result
}

const TEST_FILE_RE = /\.test\.(ts|tsx|js|jsx)$/
const SRC_EXT_RE = /\.(ts|tsx|js|jsx)$/

function walkLines(dir: string, isTest: (path: string) => boolean): { src: number; test: number } {
  let src = 0
  let test = 0
  if (!existsSync(dir)) return { src, test }
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'lib' ||
        entry.name === 'dist'
      ) {
        continue
      }
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && SRC_EXT_RE.test(entry.name)) {
        try {
          const content = readFileSync(full, 'utf-8')
          const lines = content.split('\n').length
          if (isTest(full)) test += lines
          else src += lines
        } catch {
          // ignore unreadable
        }
      }
    }
  }
  return { src, test }
}

function isTestPath(path: string): boolean {
  if (TEST_FILE_RE.test(path)) return true
  if (path.includes('/__tests__/')) return true
  if (path.includes('/tests/')) return true
  return false
}

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) {
        try {
          total += statSync(full).size
        } catch {
          // ignore
        }
      }
    }
  }
  return total
}

function countExports(pkgPath: string): number {
  // Read the index.ts entry of each public export and count `export` statements.
  // Doesn't deep-resolve re-exports; rough surface metric.
  const indexCandidates = [
    join(pkgPath, 'src', 'index.ts'),
    join(pkgPath, 'src', 'index.tsx'),
  ]
  for (const path of indexCandidates) {
    if (existsSync(path)) {
      try {
        const src = readFileSync(path, 'utf-8')
        // Match `export { ... }`, `export const|function|class|interface|type|enum|let|var X`
        const named = src.match(/^export\s+(const|function|class|interface|type|enum|let|var)\s+(\w+)/gm) ?? []
        const reexports = (src.match(/^export\s*\{([^}]+)\}/gm) ?? []).flatMap(line => {
          const inner = line.match(/\{([^}]+)\}/)?.[1] ?? ''
          return inner.split(',').map(s => s.trim()).filter(Boolean)
        })
        return named.length + reexports.length
      } catch {
        return 0
      }
    }
  }
  return 0
}

function countWorkspaceDeps(pkgJson: Record<string, any>): number {
  const deps = { ...pkgJson.dependencies, ...pkgJson.peerDependencies }
  let count = 0
  for (const v of Object.values(deps)) {
    if (typeof v === 'string' && v.includes('workspace:')) count++
  }
  return count
}

// One-shot file scan: walk the entire workspace once and build a map of
// `(consumerFile → Set<importedPackageName>)`. Avoids re-walking for every
// package, and avoids the shell.
function buildImportIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  const stack = ['packages', 'examples', 'docs'].map((d) => join(ROOT, d))
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (!existsSync(current)) continue
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'lib' ||
        entry.name === 'dist'
      ) {
        continue
      }
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && SRC_EXT_RE.test(entry.name)) {
        try {
          const src = readFileSync(full, 'utf-8')
          const matches = src.matchAll(/from\s+['"](@pyreon\/[\w-]+)(?:\/[^'"]*)?['"]/g)
          const set = new Set<string>()
          for (const m of matches) {
            if (m[1]) set.add(m[1])
          }
          if (set.size > 0) {
            index.set(relative(ROOT, full), set)
          }
        } catch {
          // ignore unreadable
        }
      }
    }
  }
  return index
}

function countConsumers(
  pkgName: string,
  importIndex: Map<string, Set<string>>,
): { ext: number; example: number } {
  const own = pkgName.replace(/^@pyreon\//, '')
  let ext = 0
  let example = 0
  for (const [path, imports] of importIndex) {
    if (!imports.has(pkgName)) continue
    if (path.includes(`/${own}/src/`) || path.includes(`/${own}/lib/`)) continue
    ext++
    if (path.startsWith('examples/')) example++
  }
  return { ext, example }
}

function getFixCommitStats(pkgPath: string): { count: number; lastDays: number | null } {
  // Count commits matching ^fix: or ^perf: that touched files in this package
  // over the last 180 days. Also extract the most recent date.
  const since = '180 days ago'
  let count = 0
  let lastDays: number | null = null
  try {
    const out = execSync(
      `git log --since="${since}" --pretty=format:"%H %ct %s" -- "${pkgPath}/" 2>/dev/null || true`,
      { cwd: ROOT, encoding: 'utf-8' },
    )
    const lines = out.split('\n').filter(Boolean)
    let lastTs = 0
    for (const line of lines) {
      const [hash, ts, ...rest] = line.split(' ')
      const subject = rest.join(' ')
      if (!hash || !ts) continue
      if (/^(fix|perf)(\([^)]+\))?[:!]/.test(subject)) {
        count++
        const tsNum = parseInt(ts, 10)
        if (tsNum > lastTs) lastTs = tsNum
      }
    }
    if (lastTs > 0) {
      lastDays = Math.floor((NOW / 1000 - lastTs) / 86400)
    }
  } catch {
    // ignore
  }
  return { count, lastDays }
}

function audit(pkg: PackageInfo, importIndex: Map<string, Set<string>>): Audit {
  const srcDir = join(pkg.path, 'src')
  const { src: srcLoc, test: testLoc } = walkLines(srcDir, isTestPath)
  const exports = countExports(pkg.path)
  const libSize = dirSize(join(pkg.path, 'lib'))
  const depCount = countWorkspaceDeps(pkg.pkgJson)
  const consumers = countConsumers(pkg.name, importIndex)
  const fix = getFixCommitStats(pkg.path)
  return {
    name: pkg.name,
    category: pkg.category,
    srcLoc,
    testLoc,
    testRatio: srcLoc > 0 ? testLoc / srcLoc : 0,
    exports,
    libSize,
    depCount,
    extConsumers: consumers.ext,
    exampleConsumers: consumers.example,
    fixCommits6mo: fix.count,
    lastFixDays: fix.lastDays,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const packages = findPackages()
const importIndex = buildImportIndex()
const results = packages.map((p) => audit(p, importIndex))
results.sort((a, b) => b.srcLoc - a.srcLoc)

// Print TSV-friendly columns. Easy to paste into a markdown table.
const cols = [
  'name',
  'category',
  'srcLoc',
  'testLoc',
  'testRatio',
  'exports',
  'libKB',
  'deps',
  'consumers',
  'examples',
  'fixes6mo',
  'lastFixDays',
]
console.log(cols.join('\t'))
for (const r of results) {
  console.log(
    [
      r.name,
      r.category,
      r.srcLoc,
      r.testLoc,
      r.testRatio.toFixed(2),
      r.exports,
      Math.round(r.libSize / 1024),
      r.depCount,
      r.extConsumers,
      r.exampleConsumers,
      r.fixCommits6mo,
      r.lastFixDays === null ? '-' : r.lastFixDays,
    ].join('\t'),
  )
}

// Aggregate totals
const totalSrcLoc = results.reduce((sum, r) => sum + r.srcLoc, 0)
const totalTestLoc = results.reduce((sum, r) => sum + r.testLoc, 0)
const totalLib = results.reduce((sum, r) => sum + r.libSize, 0)
const totalFixes = results.reduce((sum, r) => sum + r.fixCommits6mo, 0)
console.log('')
console.log(`# packages       : ${results.length}`)
console.log(`# total src LOC  : ${totalSrcLoc.toLocaleString()}`)
console.log(`# total test LOC : ${totalTestLoc.toLocaleString()} (ratio ${(totalTestLoc / totalSrcLoc).toFixed(2)})`)
console.log(`# total lib MB   : ${(totalLib / 1024 / 1024).toFixed(2)}`)
console.log(`# fix+perf 180d  : ${totalFixes}`)
