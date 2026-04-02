/**
 * Visual regression diff tool.
 *
 * Compares screenshots in scripts/visual-test/current/ against baselines in
 * scripts/visual-test/baselines/. Generates diff images and a summary.
 *
 * Requires: pixelmatch, pngjs (add as devDeps when ready to use)
 *
 * Usage: bun scripts/visual-test/diff.ts
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'

const ROOT = join(import.meta.dir, '../..')
const BASELINE_DIR = join(ROOT, 'scripts/visual-test/baselines')
const CURRENT_DIR = join(ROOT, 'scripts/visual-test/current')
const DIFF_DIR = join(ROOT, 'scripts/visual-test/diffs')

// Thresholds (percentage of differing pixels)
const PASS_THRESHOLD = 0.1
const WARN_THRESHOLD = 1.0

interface DiffResult {
  name: string
  diffPixels: number
  totalPixels: number
  percentage: number
  status: 'pass' | 'warn' | 'fail' | 'new' | 'missing'
}

function classifyStatus(percentage: number): 'pass' | 'warn' | 'fail' {
  if (percentage <= PASS_THRESHOLD) return 'pass'
  if (percentage <= WARN_THRESHOLD) return 'warn'
  return 'fail'
}

async function diffImages(): Promise<DiffResult[]> {
  // Dynamic imports — these packages must be installed as devDeps
  let PNG: typeof import('pngjs').PNG
  let pixelmatch: typeof import('pixelmatch').default

  try {
    const pngjs = await import('pngjs')
    PNG = pngjs.PNG
    const pm = await import('pixelmatch')
    pixelmatch = pm.default
  } catch {
    console.error(
      '[visual-test] Missing dependencies. Install them:\n  bun add -d pixelmatch pngjs @types/pngjs',
    )
    process.exit(1)
  }

  if (!existsSync(CURRENT_DIR)) {
    console.error('[visual-test] No current screenshots found. Run capture first.')
    process.exit(1)
  }

  mkdirSync(DIFF_DIR, { recursive: true })

  const currentFiles = readdirSync(CURRENT_DIR).filter((f) => f.endsWith('.png'))
  const baselineFiles = new Set(
    readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.png')),
  )

  if (currentFiles.length === 0) {
    console.error('[visual-test] No screenshots in current/. Run capture first.')
    process.exit(1)
  }

  const results: DiffResult[] = []

  for (const file of currentFiles) {
    const name = basename(file, '.png')

    if (!baselineFiles.has(file)) {
      results.push({
        name,
        diffPixels: 0,
        totalPixels: 0,
        percentage: 0,
        status: 'new',
      })
      continue
    }

    const baselineBuf = readFileSync(join(BASELINE_DIR, file))
    const currentBuf = readFileSync(join(CURRENT_DIR, file))

    const baselineImg = PNG.sync.read(baselineBuf)
    const currentImg = PNG.sync.read(currentBuf)

    // Handle size mismatches — treat as 100% diff
    if (baselineImg.width !== currentImg.width || baselineImg.height !== currentImg.height) {
      const totalPixels = Math.max(
        baselineImg.width * baselineImg.height,
        currentImg.width * currentImg.height,
      )
      results.push({
        name,
        diffPixels: totalPixels,
        totalPixels,
        percentage: 100,
        status: 'fail',
      })
      continue
    }

    const { width, height } = baselineImg
    const totalPixels = width * height
    const diffImg = new PNG({ width, height })

    const diffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      width,
      height,
      { threshold: 0.1 },
    )

    const percentage = (diffPixels / totalPixels) * 100

    // Write diff image
    writeFileSync(join(DIFF_DIR, file), PNG.sync.write(diffImg))

    results.push({
      name,
      diffPixels,
      totalPixels,
      percentage,
      status: classifyStatus(percentage),
    })
  }

  // Check for baselines that no longer have current screenshots
  for (const file of baselineFiles) {
    if (!currentFiles.includes(file)) {
      results.push({
        name: basename(file, '.png'),
        diffPixels: 0,
        totalPixels: 0,
        percentage: 0,
        status: 'missing',
      })
    }
  }

  return results
}

function printResults(results: DiffResult[]): void {
  const statusIcon: Record<string, string> = {
    pass: 'PASS',
    warn: 'WARN',
    fail: 'FAIL',
    new: 'NEW ',
    missing: 'GONE',
  }

  console.log('[visual-test] Diff results:\n')
  console.log('  Status  | Screenshot           | Diff')
  console.log('  --------+----------------------+----------')

  for (const r of results) {
    const icon = statusIcon[r.status]
    const pct = r.status === 'new' || r.status === 'missing'
      ? '---'
      : `${r.percentage.toFixed(3)}%`
    console.log(`  ${icon}    | ${r.name.padEnd(20)} | ${pct}`)
  }

  const fails = results.filter((r) => r.status === 'fail')
  const warns = results.filter((r) => r.status === 'warn')
  const news = results.filter((r) => r.status === 'new')

  console.log('')
  if (news.length > 0) {
    console.log(`  ${news.length} new screenshot(s) — run update to create baselines`)
  }
  if (warns.length > 0) {
    console.log(`  ${warns.length} warning(s) — minor visual changes detected`)
  }
  if (fails.length > 0) {
    console.log(`  ${fails.length} failure(s) — significant visual regressions detected`)
    process.exit(1)
  } else {
    console.log('  All checks passed.')
  }
}

const results = await diffImages()
printResults(results)
