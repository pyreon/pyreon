/**
 * Visual regression test capture script.
 *
 * Runs the Playwright visual regression spec and saves screenshots to
 * scripts/visual-test/current/. This is a thin wrapper that invokes
 * Playwright with the correct config and project settings.
 *
 * Usage: bun scripts/visual-test/capture.ts
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '../..')
const CURRENT_DIR = join(ROOT, 'scripts/visual-test/current')

// Clean previous captures
if (existsSync(CURRENT_DIR)) {
  for (const entry of new Bun.Glob('*.png').scanSync(CURRENT_DIR)) {
    rmSync(join(CURRENT_DIR, entry))
  }
} else {
  mkdirSync(CURRENT_DIR, { recursive: true })
}

console.log('[visual-test] Capturing screenshots...\n')

try {
  execSync('bunx playwright test e2e/visual-regression.spec.ts --reporter=list', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VISUAL_TEST: '1' },
  })
  console.log('\n[visual-test] Screenshots saved to scripts/visual-test/current/')
} catch {
  console.error('\n[visual-test] Capture failed. Is the dev server running?')
  process.exit(1)
}
