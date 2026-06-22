#!/usr/bin/env bun
/**
 * Run every docs generator in sequence. The generated pages emit from a
 * single source of truth (package manifests, .claude/rules/anti-patterns.md,
 * docs/src/examples/) — NEVER hand-edit their output; run this instead.
 *
 *   bun docs/scripts/gen-all.ts
 *
 * `check-generated-fresh.ts` runs this then asserts the working tree is
 * unchanged, so committed generated docs can't silently drift from source.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATORS = ['gen-reference.ts', 'gen-troubleshooting.ts', 'gen-examples-gallery.ts']

let failed = false
for (const g of GENERATORS) {
  const r = spawnSync('bun', [join(HERE, g)], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`[gen-all] ${g} exited ${r.status}`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
