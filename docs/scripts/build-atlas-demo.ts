/**
 * Builds the static Atlas workbench the /products/atlas demo embeds.
 *
 *   bun docs/scripts/build-atlas-demo.ts
 *
 * Runs the real `atlas build` on `examples/atlas-workshop` (the sample
 * library whose Button "Empty" scenario fails the accessible-name check) and
 * copies the output into `docs/public/demos/atlas/`, which the demo loads in
 * an iframe. An iframe, not an inline `<Workbench>`: the workbench owns its
 * page (a global reset on html/body, ↑↓ and ⌘K shortcuts on the window), which
 * must not leak into the marketing page.
 *
 * Re-run after changing the workshop or @pyreon/atlas. The base is relative
 * (`./`), so the site works wherever docs/public is served.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const workshop = join(root, 'examples/atlas-workshop')
const target = join(root, 'docs/public/demos/atlas')
const tmp = mkdtempSync(join(tmpdir(), 'atlas-demo-'))
const out = join(tmp, 'out')

const run = spawnSync(
  'bun',
  [join(root, 'packages/tools/atlas/bin/atlas.js'), 'build', '.', '--out', out, '--base', './', '--title', 'atlas · sample library'],
  { cwd: workshop, stdio: 'inherit' },
)
if (run.status !== 0) {
  rmSync(tmp, { recursive: true, force: true })
  throw new Error(`[Pyreon] atlas build failed (exit ${run.status}). Run it in examples/atlas-workshop to see why.`)
}

rmSync(target, { recursive: true, force: true })
// Everything except atlas build's own "this directory is mine" marker.
cpSync(out, target, { recursive: true, filter: (src) => !src.endsWith('.atlas-build-output') })
rmSync(tmp, { recursive: true, force: true })
process.stdout.write(`atlas demo → ${target}\n`)
