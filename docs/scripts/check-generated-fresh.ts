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
  'docs/src/content/docs/package-catalog.md',
  'docs/src/package-catalog.generated.ts',
  // Only the table between the gen:lathe-config markers is generated; the
  // rest of the page is hand-written, so an edit there never trips this.
  'docs/src/content/docs/lathe.md',
  'docs/src/reference-nav.generated.ts',
  'docs/src/troubleshooting-nav.generated.ts',
  'packages/native/compiler/src/generated-flow-webview-host.ts',
]

/** Compare working-tree output with the index, including new generated files. */
export function readGeneratedDiff(root: string, paths: readonly string[]): string {
  const names: string[] = []
  for (const args of [
    ['diff', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const result = spawnSync('git', [...args, '--', ...paths], {
      cwd: root,
      encoding: 'utf8',
    })
    if (result.error || result.status !== 0) {
      const reason =
        result.error?.message ||
        result.stderr.trim() ||
        `exit=${result.status}, signal=${result.signal ?? 'none'}`
      throw new Error(`git ${args[0]} failed: ${reason}`)
    }
    names.push(...result.stdout.trim().split('\n').filter(Boolean))
  }
  return names.join('\n')
}

if (import.meta.main) {
  const gen = spawnSync('bun', [join(HERE, 'gen-all.ts')], { stdio: 'inherit' })
  if (gen.status !== 0) {
    console.error('[check-generated-fresh] a generator failed — see output above')
    process.exit(1)
  }

  const flowHost = spawnSync('bun', [join(REPO_ROOT, 'scripts/gen-flow-webview-host.ts')], {
    stdio: 'inherit',
  })
  if (flowHost.status !== 0) {
    console.error(
      '[check-generated-fresh] the Flow WebView host generator failed — see output above',
    )
    process.exit(1)
  }

  let drifted: string
  try {
    drifted = readGeneratedDiff(REPO_ROOT, GENERATED)
  } catch (error) {
    console.error(
      `[check-generated-fresh] comparison failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
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
}
