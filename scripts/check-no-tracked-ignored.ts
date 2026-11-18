#!/usr/bin/env bun
/**
 * Fail when git tracks a file that `.gitignore` excludes.
 *
 * An ignore rule does not apply to a file that is already tracked, so a
 * test artifact committed once by mistake (Playwright's
 * `test-results/.last-run.json`, vitest's `.vitest/attachments/*.png`)
 * stays tracked: every local run rewrites it, the tree shows it modified,
 * and a broad `git add` commits the churn again (#4571).
 *
 * The fix for a hit is `git rm --cached <path>`; the ignore rule then takes
 * effect. If a path really must be tracked, narrow the ignore pattern with a
 * `!` negation instead of listing an exception here.
 *
 * Usage: bun scripts/check-no-tracked-ignored.ts
 */
import { spawnSync } from 'node:child_process'

const res = spawnSync('git', ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})
if (res.status !== 0) {
  console.error(`[check-no-tracked-ignored] git ls-files failed:\n${res.stderr}`)
  process.exit(1)
}
const paths = res.stdout.split('\0').filter((p) => p.length > 0)
if (paths.length > 0) {
  console.error(
    `[check-no-tracked-ignored] ${paths.length} tracked file(s) match a .gitignore rule:\n` +
      paths.map((p) => `  ${p}`).join('\n') +
      '\n\nUntrack them with `git rm --cached <path>` (the ignore rule then applies), or add a' +
      ' `!` negation to .gitignore if the file really belongs in the repository.',
  )
  process.exit(1)
}
console.log('[check-no-tracked-ignored] no tracked file matches a .gitignore rule')
