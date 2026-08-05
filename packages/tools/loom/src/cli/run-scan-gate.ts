/**
 * The validate-fast entry for the loom gate — `loom scan . --no-write` with
 * the repo root resolved from this file (cwd-independent, like every other
 * gate script).
 *
 * ── Why `--strict` ─────────────────────────────────────────────────────────
 *
 * Warnings were advisory while the repo still had 18 of them. They are now at
 * ZERO — every one was either fixed (atlas's optional runtime peers declared,
 * the happy-dom range drift aligned, the native examples' imports declared) or
 * suppressed in the root `loom` config with a written reason after being
 * verified a false positive.
 *
 * A backlog that has reached zero and is not gated refills, which is the whole
 * argument behind this repo's lint ratchet. `--strict` makes a NEW warning red
 * instead of scrollback. The escape hatch is deliberate and auditable: an
 * `ignore` entry in the root `loom` config REQUIRES a `reason`, so waving a
 * finding through is a reviewable diff rather than a silent tolerance.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from './index'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const code = await runCli(['scan', repoRoot, '--no-write', '--strict'])
process.exit(code)
