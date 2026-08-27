import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PresetName } from './types'

/**
 * `pyreon-lint --init` — write a starting `.pyreonlintrc.json`.
 *
 * Adoption previously meant hand-writing config against documentation, which
 * is the step where a tool loses people: the defaults are good, but you have
 * to know that to leave them alone.
 *
 * Three things it does that a copied snippet does not:
 *
 *  - **Picks the preset from the project**, rather than always writing
 *    `recommended`. A package that ships to npm wants `lib`; an app wants
 *    `app`. Getting this wrong is quiet — `lib` turns on library-author rules
 *    an app can never satisfy.
 *  - **Points `$schema` at the installed schema**, so an editor completes rule
 *    ids and rejects typos. A mistyped rule id is otherwise silent: the entry
 *    just matches nothing.
 *  - **Refuses to overwrite.** A config is hand-tuned over time; clobbering it
 *    to "help" is the one unrecoverable thing this command could do.
 */

export interface InitResult {
  /** `written` | `exists` | `no-package-json` */
  status: 'written' | 'exists' | 'no-package-json'
  path: string
  preset?: PresetName
  contents?: string
  /** Human-readable next step. */
  message: string
}

interface PkgJson {
  name?: string
  private?: boolean
  main?: string
  module?: string
  exports?: unknown
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readPkg(cwd: string): PkgJson | null {
  try {
    return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as PkgJson
  } catch {
    return null
  }
}

/**
 * `lib` for something that ships to a consumer, `app` otherwise.
 *
 * A published package is the one that needs the library-author rules
 * (dev-guard-warnings, no-process-dev-gate); an app can never satisfy them and
 * would just see noise. `private: true` is the strongest signal, then the
 * presence of an entry point.
 */
export function detectPreset(pkg: PkgJson | null): PresetName {
  if (!pkg) return 'recommended'
  if (pkg.private === true) return 'app'
  if (pkg.main || pkg.module || pkg.exports) return 'lib'
  return 'app'
}

/** Pyreon libraries the project declares — reported, not written into config. */
export function detectPyreonDeps(pkg: PkgJson | null): string[] {
  if (!pkg) return []
  const all = { ...pkg.dependencies, ...pkg.devDependencies }
  return Object.keys(all)
    .filter((d) => d.startsWith('@pyreon/'))
    .sort()
}

/**
 * Build the config file body.
 *
 * Deliberately MINIMAL: a preset and a schema reference, with no rule entries.
 * Scaffolding every rule at its default severity would freeze today's defaults
 * into the user's file, so a later improvement to `recommended` would never
 * reach them — the config would silently pin the old behaviour forever.
 */
export function buildInitConfig(preset: PresetName): string {
  return `${JSON.stringify(
    {
      $schema: './node_modules/@pyreon/lint/schema/pyreonlintrc.schema.json',
      preset,
    },
    null,
    2,
  )}\n`
}

/**
 * Write a starting config into `cwd`, refusing to clobber an existing one.
 *
 * The refusal is an ATOMIC exclusive create (`flag: 'wx'`), not an
 * `existsSync` check followed by a write. Check-then-use is a real race — the
 * file can appear between the two — and CodeQL flags it as
 * `js/file-system-race`, a class this repo has hit before. Letting the
 * filesystem enforce the invariant removes the window rather than narrowing
 * it, and is simpler besides.
 */
export function initConfig(cwd: string): InitResult {
  const path = join(cwd, '.pyreonlintrc.json')

  const pkg = readPkg(cwd)
  if (!pkg) {
    return {
      status: 'no-package-json',
      path,
      message:
        'No package.json here, so the preset cannot be inferred. Run this from your project root.',
    }
  }

  const preset = detectPreset(pkg)
  const contents = buildInitConfig(preset)
  try {
    // `wx` fails with EEXIST rather than truncating. A config is hand-tuned
    // over time; clobbering it is the one unrecoverable thing this command
    // could do, so the guarantee belongs in the syscall, not in a prior check.
    writeFileSync(path, contents, { encoding: 'utf-8', flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return {
        status: 'exists',
        path,
        message:
          '.pyreonlintrc.json already exists — leaving it alone. Delete it first if you want a fresh one.',
      }
    }
    throw err
  }

  const deps = detectPyreonDeps(pkg)
  const libNote =
    deps.length > 0
      ? `\n  Library rules will activate for: ${deps.join(', ')}`
      : '\n  No @pyreon/* dependencies found yet — library rules stay silent until there are.'

  return {
    status: 'written',
    path,
    preset,
    contents,
    message:
      `Wrote .pyreonlintrc.json with the \`${preset}\` preset` +
      `${preset === 'lib' ? ' (this package ships an entry point).' : ' (no published entry point).'}` +
      libNote +
      '\n\n  Next: `pyreon-lint .`' +
      '\n  A rule not firing? `pyreon-lint --why-off <rule>` explains why.',
  }
}
