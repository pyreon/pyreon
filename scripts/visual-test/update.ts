/**
 * Visual regression baseline updater.
 *
 * Copies current screenshots to baselines, making the current state the new
 * reference for future comparisons.
 *
 * Usage: bun scripts/visual-test/update.ts [--name <screenshot>]
 *
 * Options:
 *   --name <name>  Update a single baseline by name (without .png extension)
 *   (no args)      Update all baselines from current screenshots
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '../..')
const BASELINE_DIR = join(ROOT, 'scripts/visual-test/baselines')
const CURRENT_DIR = join(ROOT, 'scripts/visual-test/current')

function update(nameFilter?: string): void {
  if (!existsSync(CURRENT_DIR)) {
    console.error('[visual-test] No current screenshots found. Run capture first.')
    process.exit(1)
  }

  mkdirSync(BASELINE_DIR, { recursive: true })

  const files = readdirSync(CURRENT_DIR).filter((f) => f.endsWith('.png'))

  if (files.length === 0) {
    console.error('[visual-test] No screenshots in current/. Run capture first.')
    process.exit(1)
  }

  const toUpdate = nameFilter
    ? files.filter((f) => f === `${nameFilter}.png`)
    : files

  if (toUpdate.length === 0 && nameFilter) {
    console.error(`[visual-test] Screenshot "${nameFilter}" not found in current/.`)
    console.error(`  Available: ${files.map((f) => f.replace('.png', '')).join(', ')}`)
    process.exit(1)
  }

  for (const file of toUpdate) {
    copyFileSync(join(CURRENT_DIR, file), join(BASELINE_DIR, file))
    console.log(`  Updated: ${file}`)
  }

  console.log(`\n[visual-test] ${toUpdate.length} baseline(s) updated.`)
}

// Parse --name argument
const nameIdx = process.argv.indexOf('--name')
const nameFilter = nameIdx !== -1 ? process.argv[nameIdx + 1] : undefined

update(nameFilter)
