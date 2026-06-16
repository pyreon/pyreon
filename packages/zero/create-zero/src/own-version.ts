/**
 * Single source of truth for create-zero's OWN version — the monorepo
 * version stamped into every `@pyreon/*` dep of a scaffolded project.
 *
 * This file MUST live at `src/` top-level. `import.meta.dirname` resolves to
 * the executing file's directory, which differs between the two ways this
 * code runs:
 *   - SOURCE (vitest / bun condition): this file at `src/`        → `..` = root
 *   - BUNDLE (production `lib/index.js`, all modules flattened in): `lib/` → `..` = root
 * Because a top-level `src/` file and the flattened `lib/` bundle are BOTH
 * exactly one level under the package root, a single `..` is correct in both.
 * A file in a SUBDIRECTORY (e.g. `src/generators/`) cannot satisfy both —
 * that mismatch shipped the 0.32.0 startup crash. Do NOT move this file into
 * a subdirectory, and read the version ONLY through here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8'),
) as { version: string }

/** create-zero's version, e.g. `0.32.1`. */
export const OWN_VERSION = pkg.version

/** Caret range for `@pyreon/*` deps, e.g. `^0.32.1`. */
export const PYREON_DEP_RANGE = `^${OWN_VERSION}`
