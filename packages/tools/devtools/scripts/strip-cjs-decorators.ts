#!/usr/bin/env bun
/**
 * Post-build: strip CJS module decorators from IIFE-formatted outputs.
 *
 * The bug: `@vitus-labs/tools-rolldown` emits `Object.defineProperties(exports,
 * { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } })`
 * at the top of every output regardless of format. For IIFE outputs (the 4
 * browser-context entries here: `content-script.js`, `devtools.js`,
 * `panel.js`, `page-hook.js`) the IIFE wrapper has NO `exports` parameter,
 * so this line throws `ReferenceError: exports is not defined` the moment
 * Chrome loads the script. Net result: the entire content-script chain
 * (page-hook injection, message forwarding to the panel) was dead in prod.
 *
 * `background.js` is ESM-format so its top-level `exports` reference is
 * legal — only the IIFE entries are affected.
 *
 * Two ways to fix:
 * 1. Patch upstream rolldown helper to omit module decorators for IIFE
 * 2. Strip the bad line here as a post-build pass (this script)
 *
 * Option 2 is the minimum-risk localized fix that doesn't touch the
 * upstream tooling. Idempotent — running twice removes nothing the
 * second time. Logs the per-file action for verifier confirmation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(import.meta.dir, '..', 'dist')

// IIFE entries that need the strip. Background is ESM so excluded.
const IIFE_ENTRIES = ['content-script.js', 'devtools.js', 'panel.js', 'page-hook.js']

const BAD_LINE_RE = /^Object\.defineProperties\(exports, \{ __esModule: \{ value: true \}, \[Symbol\.toStringTag\]: \{ value: 'Module' \} \}\);\n?/m

let stripped = 0
let alreadyClean = 0

for (const name of IIFE_ENTRIES) {
  const path = join(DIST, name)
  if (!existsSync(path)) {
    console.error(`[strip-cjs] missing: ${path}`)
    process.exit(1)
  }
  const before = readFileSync(path, 'utf-8')
  const after = before.replace(BAD_LINE_RE, '')
  if (after === before) {
    alreadyClean++
    continue
  }
  writeFileSync(path, after)
  stripped++
  console.log(`[strip-cjs] ${name} — stripped exports decorator`)
}

if (stripped === 0 && alreadyClean === IIFE_ENTRIES.length) {
  console.log(`[strip-cjs] all ${IIFE_ENTRIES.length} IIFE entries already clean (rolldown may have been fixed upstream)`)
} else if (stripped > 0) {
  console.log(`[strip-cjs] ${stripped}/${IIFE_ENTRIES.length} entries fixed; ${alreadyClean} already clean`)
}
