/**
 * Visual regression report generator.
 *
 * Reads diff results and generates a markdown report suitable for PR comments.
 *
 * Usage: bun scripts/visual-test/report.ts > report.md
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { basename, join } from 'path'

const ROOT = join(import.meta.dir, '../..')
const BASELINE_DIR = join(ROOT, 'scripts/visual-test/baselines')
const CURRENT_DIR = join(ROOT, 'scripts/visual-test/current')
const DIFF_DIR = join(ROOT, 'scripts/visual-test/diffs')

interface ScreenshotInfo {
  name: string
  hasBaseline: boolean
  hasCurrent: boolean
  hasDiff: boolean
}

function collectScreenshots(): ScreenshotInfo[] {
  const baselines = new Set(
    existsSync(BASELINE_DIR)
      ? readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.png'))
      : [],
  )
  const currents = new Set(
    existsSync(CURRENT_DIR)
      ? readdirSync(CURRENT_DIR).filter((f) => f.endsWith('.png'))
      : [],
  )
  const diffs = new Set(
    existsSync(DIFF_DIR)
      ? readdirSync(DIFF_DIR).filter((f) => f.endsWith('.png'))
      : [],
  )

  const allNames = new Set([...baselines, ...currents])
  const results: ScreenshotInfo[] = []

  for (const file of allNames) {
    results.push({
      name: basename(file, '.png'),
      hasBaseline: baselines.has(file),
      hasCurrent: currents.has(file),
      hasDiff: diffs.has(file),
    })
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

function generateReport(): string {
  const screenshots = collectScreenshots()

  if (screenshots.length === 0) {
    return '## Visual Regression Report\n\nNo screenshots found. Run `bun run visual-test:capture` first.\n'
  }

  const lines: string[] = [
    '## Visual Regression Report',
    '',
    '| Screenshot | Baseline | Current | Diff |',
    '|------------|----------|---------|------|',
  ]

  for (const s of screenshots) {
    const status = !s.hasBaseline
      ? 'NEW'
      : !s.hasCurrent
        ? 'MISSING'
        : s.hasDiff
          ? 'CHANGED'
          : 'OK'

    lines.push(
      `| ${s.name} | ${s.hasBaseline ? 'yes' : '-'} | ${s.hasCurrent ? 'yes' : '-'} | ${status} |`,
    )
  }

  const newScreenshots = screenshots.filter((s) => !s.hasBaseline)
  const missing = screenshots.filter((s) => !s.hasCurrent)
  const changed = screenshots.filter((s) => s.hasDiff)

  lines.push('')

  if (newScreenshots.length > 0) {
    lines.push(
      `**${newScreenshots.length} new screenshot(s)** — run \`bun run visual-test:update\` to create baselines.`,
    )
  }
  if (missing.length > 0) {
    lines.push(`**${missing.length} missing screenshot(s)** — baselines exist but no current capture.`)
  }
  if (changed.length > 0) {
    lines.push(
      `**${changed.length} changed screenshot(s)** — review diff images in \`scripts/visual-test/diffs/\`.`,
    )
  }
  if (newScreenshots.length === 0 && missing.length === 0 && changed.length === 0) {
    lines.push('All screenshots match baselines.')
  }

  lines.push('')

  return lines.join('\n')
}

console.log(generateReport())
