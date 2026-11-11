// `create-multiplatform` CLI — scaffolds a new web + iOS + Android Pyreon
// project sharing one `src/App.tsx`. Thin I/O wrapper over `buildScaffold`
// (the pure generator in `scaffold.ts`, which holds all templates + is
// unit-tested in isolation).
//
// Usage:
//   npx create-multiplatform <project-name>
//   npx create-multiplatform my-app --dir ./apps/my-app
//
// Phase D4 (native readiness audit 2026-06): adds name + dir validation
// to prevent broken scaffolds. Scout-8's audit finding: "no
// kebab-case validation, no existing-dir check."

import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  columns,
  createTerm,
  formatElapsed,
  header,
  plural,
  type Term,
  verdict,
  visibleWidth,
  wrap,
  WRAP_WIDTH,
} from '@pyreon/ansi'
import { OWN_VERSION } from './own-version'
import { buildScaffold, validateScheme } from './scaffold'

export interface CliArgs {
  name: string
  dir: string
  /** `--scheme`: the URL scheme the app is opened by. Absent = the project's identifier. */
  scheme?: string
}

/**
 * Phase D4 — validate a project name as kebab-case (lower-case alpha-
 * num + hyphens). Mirrors npm's package-name validation (a subset —
 * we don't allow scopes or dots since the name flows into Xcode
 * project names + Gradle module names that have stricter rules).
 *
 * Rules:
 *   - 1-50 chars
 *   - starts with a lowercase letter
 *   - lowercase letters, digits, hyphens only
 *   - no consecutive hyphens (`--`)
 *   - no trailing hyphen
 *
 * Throws with an actionable message on failure. The message names
 * the offending input so the user can copy-paste-fix.
 */
export function validateProjectName(name: string): void {
  if (name.length === 0) {
    throw new Error('Project name cannot be empty.')
  }
  if (name.length > 50) {
    throw new Error(
      `Project name "${name}" is ${name.length} characters; max 50. Pick something shorter — names propagate to Xcode project + Gradle module IDs that have practical length limits.`,
    )
  }
  if (!/^[a-z]/.test(name)) {
    throw new Error(
      `Project name "${name}" must start with a lowercase letter. Native targets (Xcode + Gradle) reject leading digits/special chars. Try "${suggestKebab(name)}" instead.`,
    )
  }
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(name)) {
    throw new Error(
      `Project name "${name}" must be lowercase kebab-case (letters, digits, hyphens; no trailing hyphen). Try "${suggestKebab(name)}" instead.`,
    )
  }
  if (name.includes('--')) {
    throw new Error(
      `Project name "${name}" contains consecutive hyphens. Use single hyphens between words: "${suggestKebab(name)}".`,
    )
  }
}

/**
 * Phase D4 helper — suggest a fixed kebab-case name from arbitrary
 * input. Used in error messages so the user has an actionable
 * "did you mean?" alternative.
 *
 * Strips invalid leading chars, lowercases, replaces invalid chars
 * with hyphens, collapses double-hyphens, trims trailing hyphens.
 */
export function suggestKebab(input: string): string {
  // Cap input length BEFORE regex operations so a malicious caller
  // can't exploit polynomial-time behavior on greedy quantifiers
  // (CodeQL: js/polynomial-redos). 200 chars is well above the final
  // 50-char truncation and any realistic project name.
  let s = input.slice(0, 200).toLowerCase()
  s = s.replace(/[^a-z0-9-]+/g, '-')
  s = s.replace(/^[^a-z]+/, '') // strip leading non-letters
  s = s.replace(/-+/g, '-')
  s = s.replace(/-+$/, '')
  s = s.slice(0, 50) // truncate to max length
  return s.length > 0 ? s : 'my-app'
}

/**
 * Phase D4 — refuse to scaffold into an existing non-empty directory.
 * Prevents accidentally overwriting in-progress work or polluting
 * an existing project's tree.
 *
 * Empty dirs are fine (e.g. `mkdir my-app && cd my-app && npx
 * create-multiplatform .`). Nonexistent dirs are fine (will be
 * created by writeScaffold's mkdir-recursive call). Only the
 * "dir exists AND has files" case is rejected.
 */
export function validateTargetDir(targetDir: string): void {
  const resolved = resolve(targetDir)
  if (!existsSync(resolved)) return // doesn't exist yet — writeScaffold will mkdir
  try {
    const entries = readdirSync(resolved).filter(
      // Allow common metadata-only dirs that often exist in a fresh
      // mkdir-then-cd flow (.git initialized but no commits yet, etc.).
      (e) => e !== '.git' && e !== '.DS_Store',
    )
    if (entries.length > 0) {
      throw new Error(
        `Target directory "${resolved}" already exists and is non-empty (${entries.length} entry/entries: ${entries.slice(0, 3).join(', ')}${entries.length > 3 ? ', ...' : ''}). Refusing to overwrite — pick a new --dir or remove the existing contents first.`,
      )
    }
  } catch (err) {
    // readdirSync threw — likely a permission error. Re-throw with a
    // clearer message than the raw EACCES.
    if (err instanceof Error && err.message.startsWith('Target directory')) {
      throw err
    }
    throw new Error(
      `Cannot read target directory "${resolved}" (${err instanceof Error ? err.message : String(err)}). Check permissions.`,
      { cause: err },
    )
  }
}

/** Parse argv (after `node script`) into a name + target dir. */
/** Single source for the usage line — the help path and the missing-name
 *  error path must not drift apart. */
export const USAGE = 'Usage: create-multiplatform <project-name> [--dir <path>] [--scheme <url-scheme>]'

/** True when the user explicitly asked for help. */
export function wantsHelp(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h')
}

export function parseArgs(argv: string[]): CliArgs {
  let name: string | undefined
  let dir: string | undefined
  let scheme: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir' || a === '-d') {
      dir = argv[++i]
    } else if (a === '--scheme') {
      scheme = argv[++i]
      if (scheme === undefined || scheme.startsWith('-')) {
        throw new Error('[create-multiplatform] --scheme needs a value (for example --scheme myapp).')
      }
    } else if (a !== undefined && a.startsWith('--scheme=')) {
      scheme = a.slice('--scheme='.length)
    } else if (a !== undefined && !a.startsWith('-') && name === undefined) {
      name = a
    }
  }
  if (name === undefined || name.length === 0) {
    throw new Error(USAGE)
  }
  return { name, dir: dir ?? name, ...(scheme !== undefined ? { scheme } : {}) }
}

/** Write the scaffold's file tree under `targetDir`. */
export async function writeScaffold(
  name: string,
  targetDir: string,
  scheme?: string,
): Promise<string[]> {
  const files = buildScaffold({ name, ...(scheme !== undefined ? { scheme } : {}) })
  const root = resolve(targetDir)
  for (const f of files) {
    const full = join(root, f.path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, f.content, 'utf8')
  }
  return files.map((f) => f.path)
}

/**
 * Render for a specific terminal instead of detecting one: colour level
 * (0 plain, 1 sixteen colours, 2 truecolor), background, symbol set and
 * wrap width. Anything left out is detected by `@pyreon/ansi` (`NO_COLOR`,
 * `FORCE_COLOR`, `TERM=dumb`, the stream's TTY, `PYREON_CLI_THEME`, locale).
 */
export interface OutputStyle {
  color?: 0 | 1 | 2 | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
  width?: number | undefined
}

const termFor = (style: OutputStyle | undefined, isTTY: boolean): Term =>
  createTerm({ level: style?.color, theme: style?.theme, unicode: style?.unicode, isTTY })

/** Rule 1 first line: `create-multiplatform · 0.53.0`. */
const headline = (t: Term): string => header(t, 'create-multiplatform', OWN_VERSION)

export interface ScaffoldSummary {
  name: string
  dir: string
  /** Files written. */
  files: number
  /** Wall time of validation + writing. */
  elapsedMs: number
}

/**
 * The success report: the header, the commands to run next, and the verdict
 * line with the file count and elapsed time.
 */
export function formatSummary(s: ScaffoldSummary, style?: OutputStyle): string {
  const t = termFor(style, process.stdout.isTTY === true)
  const b = t.sym('bullet')
  const steps = columns([
    [t.dim('next'), `cd ${s.dir} && npm install && npm run dev`],
    [t.dim('native'), `npm run build:ios (Xcode) ${b} npm run build:android (Android SDK)`],
  ])
  return [
    headline(t),
    '',
    ...steps,
    '',
    verdict(t, 'ok', `scaffolded ${s.name} ${t.sym('arrow')} ${s.dir}/`, [
      plural(s.files, 'file'),
      formatElapsed(s.elapsedMs),
    ]),
  ].join('\n')
}

/**
 * The failure report: the header, then `✗ error: <message>` wrapped at the
 * width (100 by default) with a hanging indent. The message itself is the
 * thrown one, unchanged, and never split inside a word or path.
 */
export function formatError(err: unknown, style?: OutputStyle): string {
  const t = termFor(style, process.stderr.isTTY === true)
  const width = style?.width ?? WRAP_WIDTH
  const message = err instanceof Error ? err.message : String(err)
  const prefix = `${t.err(t.sym('err'))} ${t.err('error:')} `
  const lines = wrap(message, width, width - visibleWidth(prefix), '  ')
  return [headline(t), `${prefix}${lines[0] ?? ''}`, ...lines.slice(1)].join('\n')
}

export async function main(argv: string[], style?: OutputStyle): Promise<void> {
  // `--help` is a SUCCESSFUL request for help: stdout, exit 0. Previously it
  // fell through to parseArgs, which saw no project name and THREW — so
  // `npx create-multiplatform --help` printed the usage line to STDERR and
  // exited 1. That breaks any script or CI step checking the exit code, and
  // hides usage from a plain `| grep`. Every other published Pyreon bin
  // (pyreon-lint, zero, create-zero) already exits 0 on stdout; this one was
  // the outlier.
  if (wantsHelp(argv)) {
    // eslint-disable-next-line no-console
    console.log(USAGE)
    return
  }
  const started = performance.now()
  const { name, dir, scheme } = parseArgs(argv)
  // Phase D4: validate BEFORE writing — fail fast with actionable
  // error rather than producing a broken scaffold.
  validateProjectName(name)
  validateTargetDir(dir)
  // buildScaffold validates the scheme too; doing it here fails BEFORE any file is written.
  if (scheme !== undefined) validateScheme(scheme)
  const written = await writeScaffold(name, dir, scheme)
  // The native toolchain (@pyreon/native-cli, the Swift/Kotlin runtimes and
  // routers) publishes to npm alongside this scaffolder — same fixed release
  // group — so `npm install` resolves every declared dependency. The
  // "toolchain not published, install will 404" notice that used to print
  // here described the pre-publish state and was removed the release the
  // stack went public; native builds need only the local platform SDKs.
  // eslint-disable-next-line no-console
  console.log(
    formatSummary(
      { name, dir, files: written.length, elapsedMs: performance.now() - started },
      style,
    ),
  )
}

/**
 * The bin entry: run `main`, print any failure as `formatError` on stderr,
 * and return the exit code (0 success, 1 failure).
 */
export async function run(argv: string[], style?: OutputStyle): Promise<number> {
  try {
    await main(argv, style)
    return 0
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(formatError(err, style))
    return 1
  }
}
