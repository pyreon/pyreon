#!/usr/bin/env bun
/**
 * Which packages' cross-ENGINE browser suites (WebKit + Firefox) does this
 * change need to run?
 *
 * ## Why a separate selection
 *
 * `Test (browser)` runs every package's `test:browser` in Chromium only — its
 * Playwright cache holds Chromium alone, in an actions cache that sits within
 * a few hundred MB of GitHub's 10 GB limit. A package whose correctness
 * depends on ENGINE behaviour (a JSON.parse reviver's `context.source`, the
 * `on*` handler vocabulary a given engine compiles, `history` semantics)
 * declares a second script, `test:browser:engines`, running the same suite in
 * WebKit and Firefox as well. Opting in is the whole interface: any package
 * with that script is picked up here — there is no list to keep in sync.
 *
 * Installing two more engines costs ~a minute of download + OS deps, so the
 * step only runs when an opted-in package is AFFECTED by the change.
 *
 * ## Fail-closed
 *
 * The caller passes the verdict of `scripts/affected.ts` (a list of
 * `--filter='<name>'` flags). Anything this script cannot read as such a list
 * — a root-file `--filter=*`, a missing verdict, an unrecognised token —
 * selects EVERY engine suite. Only a clean, fully-parsed verdict narrows the
 * run. A mis-detection must cost a slower run, never a skipped check.
 *
 * Usage:
 *   bun scripts/browser-engines.ts --all
 *   bun scripts/browser-engines.ts --affected="$(bun run scripts/affected.ts --base=$BASE)"
 * Prints a JSON array of package names on stdout.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ENGINES_SCRIPT = 'test:browser:engines'

// `import.meta.dirname`, not Bun's `import.meta.dir`: the unit tests import
// this under vitest, where only the standard spelling is defined.
const ROOT = resolve(import.meta.dirname, '..')

/** Every `packages/<category>/<pkg>` declaring an engines suite, sorted. */
export function discoverEngineSuites(root: string = ROOT): string[] {
  const out: string[] = []
  const packagesRoot = join(root, 'packages')
  if (!existsSync(packagesRoot)) return out
  for (const category of readdirSync(packagesRoot)) {
    const categoryPath = join(packagesRoot, category)
    if (!statSync(categoryPath).isDirectory()) continue
    for (const pkg of readdirSync(categoryPath)) {
      const pkgJson = join(categoryPath, pkg, 'package.json')
      if (!existsSync(pkgJson)) continue
      const json = JSON.parse(readFileSync(pkgJson, 'utf-8')) as {
        name?: string
        scripts?: Record<string, string>
      }
      if (json.name && json.scripts?.[ENGINES_SCRIPT]) out.push(json.name)
    }
  }
  return out.sort()
}

/**
 * Parse an `affected.ts` verdict into package names, or `null` when it cannot
 * be read as a plain list (the caller then runs everything).
 */
export function parseAffectedFlags(flags: string): string[] | null {
  const trimmed = flags.trim()
  if (trimmed === '') return []
  const names: string[] = []
  for (const token of trimmed.split(/\s+/)) {
    const m = /^--filter=(?:'([^']+)'|"([^"]+)"|([^'"\s]+))$/.exec(token)
    if (!m) return null
    const name = m[1] ?? m[2] ?? m[3]!
    if (name.includes('*')) return null
    names.push(name)
  }
  return names
}

/**
 * The engine suites to run. `flags === null` (no verdict) or an unparseable
 * verdict selects every suite.
 */
export function selectEngineSuites(flags: string | null, suites: readonly string[]): string[] {
  if (flags === null) return [...suites]
  const affected = parseAffectedFlags(flags)
  if (affected === null) return [...suites]
  const set = new Set(affected)
  return suites.filter((s) => set.has(s))
}

function main(): void {
  const args = process.argv.slice(2)
  let flags: string | null = null
  for (const arg of args) {
    if (arg === '--all') flags = null
    else if (arg.startsWith('--affected=')) flags = arg.slice('--affected='.length)
    else {
      console.error(`browser-engines: unknown argument ${arg}`)
      process.exit(2)
    }
  }
  process.stdout.write(JSON.stringify(selectEngineSuites(flags, discoverEngineSuites())))
}

if (import.meta.main) main()
