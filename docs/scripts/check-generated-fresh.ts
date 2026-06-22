#!/usr/bin/env bun
/**
 * Freshness gate: regenerate every docs generator's output, then assert the
 * working tree is unchanged. Fails (exit 1) if any generated page drifted
 * from its source (a manifest edit, a new example, an anti-patterns.md entry
 * landed without re-running the generators). Run in CI + locally:
 *
 *   bun docs/scripts/check-generated-fresh.ts
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')

// Paths the generators own (relative to repo root). git diff is scoped to
// these so an unrelated dirty working tree doesn't false-fail the gate.
const GENERATED = [
  'docs/src/content/docs/reference',
  'docs/src/content/docs/troubleshooting',
  'docs/src/content/docs/troubleshooting.md',
  'docs/src/content/docs/examples.md',
  'docs/src/reference-nav.generated.ts',
  'docs/src/troubleshooting-nav.generated.ts',
]

const gen = spawnSync('bun', [join(HERE, 'gen-all.ts')], { stdio: 'inherit' })
if (gen.status !== 0) {
  console.error('[check-generated-fresh] a generator failed — see output above')
  process.exit(1)
}

const diff = spawnSync('git', ['diff', '--name-only', '--', ...GENERATED], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
})
const drifted = (diff.stdout ?? '').trim()
if (drifted) {
  console.error(
    '[check-generated-fresh] ✗ generated docs are STALE — regenerate + commit:\n' +
      drifted
        .split('\n')
        .map((f) => `  ${f}`)
        .join('\n') +
      '\n\nFix: `bun docs/scripts/gen-all.ts` then commit the result.',
  )
  process.exit(1)
}
console.warn('[check-generated-fresh] ✓ all generated docs are in sync with source')
