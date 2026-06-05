#!/usr/bin/env bun
/**
 * lighthouse-compare — run Lighthouse against 5 representative pages
 * on both the legacy VitePress site and the new docs-zero preview.
 * Reports the score delta per category; exits non-zero if docs-zero
 * regresses by >5 points on any metric.
 *
 * Usage:
 *   bun scripts/lighthouse-compare.ts \
 *     --legacy https://pyreon.github.io/pyreon \
 *     --preview https://pyreon.github.io/pyreon/preview
 *
 * Both URLs should point at the SITE ROOT (the script appends each
 * representative path).
 */
import { spawn } from 'node:child_process'

interface LighthouseScore {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
}

interface PageResult {
  path: string
  legacy: LighthouseScore | null
  preview: LighthouseScore | null
  errors: string[]
}

const PAGES = [
  '/docs/',
  '/docs/getting-started',
  '/docs/router',
  '/docs/reactivity',
  '/docs/mcp',
]

const TOLERANCE = 5 // max acceptable regression per category

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.legacy || !args.preview) {
    console.error(
      'Usage: lighthouse-compare --legacy <url> --preview <url>',
    )
    process.exit(2)
  }

  const results: PageResult[] = []
  for (const path of PAGES) {
    const legacyUrl = args.legacy + path
    const previewUrl = args.preview + path
    console.log(`\n── ${path} ─────────────────────────────`)
    console.log(`  legacy:  ${legacyUrl}`)
    console.log(`  preview: ${previewUrl}`)
    const result: PageResult = {
      path,
      legacy: null,
      preview: null,
      errors: [],
    }
    try {
      result.legacy = await runLighthouse(legacyUrl)
    } catch (err) {
      result.errors.push(`legacy failed: ${(err as Error).message}`)
    }
    try {
      result.preview = await runLighthouse(previewUrl)
    } catch (err) {
      result.errors.push(`preview failed: ${(err as Error).message}`)
    }
    results.push(result)
    printResult(result)
  }

  const regressions = collectRegressions(results)
  console.log('\n══════════════════════════════════════')
  if (regressions.length === 0) {
    console.log('✓ docs-zero stays within tolerance on every metric')
    process.exit(0)
  }
  console.log(`✗ ${regressions.length} regression(s) over ${TOLERANCE}-point tolerance:`)
  for (const r of regressions) console.log(`  ${r}`)
  process.exit(1)
}

function parseArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg?.startsWith('--')) continue
    const key = arg.slice(2)
    const val = args[i + 1] ?? ''
    out[key] = val
    i++
  }
  return out
}

async function runLighthouse(url: string): Promise<LighthouseScore> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'bunx',
      [
        'lighthouse',
        url,
        '--output=json',
        '--quiet',
        '--chrome-flags=--headless --no-sandbox',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`lighthouse exited ${code}: ${stderr.slice(0, 200)}`))
        return
      }
      try {
        const report = JSON.parse(stdout)
        const cats = report.categories
        resolve({
          performance: Math.round((cats.performance?.score ?? 0) * 100),
          accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
          bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
          seo: Math.round((cats.seo?.score ?? 0) * 100),
        })
      } catch (e) {
        reject(e)
      }
    })
  })
}

function printResult(r: PageResult) {
  const cols = ['performance', 'accessibility', 'bestPractices', 'seo'] as const
  if (r.legacy && r.preview) {
    for (const col of cols) {
      const l = r.legacy[col]
      const p = r.preview[col]
      const delta = p - l
      const sign = delta >= 0 ? '+' : ''
      const marker = delta < -TOLERANCE ? '✗' : delta < 0 ? '~' : '✓'
      console.log(`  ${marker} ${col.padEnd(14)} ${String(l).padStart(3)} → ${String(p).padStart(3)} (${sign}${delta})`)
    }
  }
  for (const err of r.errors) console.log(`  ! ${err}`)
}

function collectRegressions(results: PageResult[]): string[] {
  const out: string[] = []
  const cols = ['performance', 'accessibility', 'bestPractices', 'seo'] as const
  for (const r of results) {
    if (!r.legacy || !r.preview) continue
    for (const col of cols) {
      const delta = r.preview[col] - r.legacy[col]
      if (delta < -TOLERANCE) {
        out.push(`${r.path} ${col}: ${r.legacy[col]} → ${r.preview[col]} (${delta})`)
      }
    }
  }
  return out
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
