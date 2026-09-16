/**
 * Single source of truth for create-multiplatform's OWN version — the
 * monorepo version stamped into every `@pyreon/*` dep of a scaffolded
 * project.
 *
 * Copied (not imported) from `@pyreon/create-zero`'s `own-version.ts`:
 * the two scaffolders do not depend on each other, and a dependency
 * added purely to share five lines would put create-zero's whole module
 * graph into create-multiplatform's tarball.
 *
 * **Why a derived `^<own version>` rather than `latest`:** `latest`
 * resolves each dep independently at install time, so a PARTIALLY
 * published release silently scaffolds a MIXED stack. That is not
 * hypothetical — after the 0.51.0 release the four native packages were
 * still at 0.50.0 (their PUTs 404'd for a missing Trusted Publisher and
 * publish.ts classified that as a skip), so `latest` produced 0.51.0 JS
 * over a 0.50.0 native runtime, with no signal to the user. A caret
 * range pinned to the scaffolder's own version fails the install
 * LOUDLY instead, which is the correct outcome for an incomplete
 * release. `create-zero` has always done this.
 *
 * This file MUST live at `src/` top-level. `import.meta.dirname`
 * resolves to the executing file's directory, which differs between the
 * two ways this code runs:
 *   - SOURCE (vitest / bun condition): this file at `src/`        → `..` = root
 *   - BUNDLE (production `lib/index.js`, all modules flattened in): `lib/` → `..` = root
 * Because a top-level `src/` file and the flattened `lib/` bundle are
 * BOTH exactly one level under the package root, a single `..` is
 * correct in both. A file in a SUBDIRECTORY cannot satisfy both — that
 * mismatch shipped create-zero's 0.32.0 startup crash. Do NOT move this
 * file into a subdirectory, and read the version ONLY through here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8'),
) as { version: string }

/** create-multiplatform's version, e.g. `0.51.0`. */
export const OWN_VERSION = pkg.version

/** Caret range for `@pyreon/*` deps, e.g. `^0.51.0`. */
export const PYREON_DEP_RANGE = `^${OWN_VERSION}`
