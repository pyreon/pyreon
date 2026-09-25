/**
 * `lathe generate` / `lathe check`.
 *
 * Pure argv parsing and a run function that takes its filesystem as an
 * injected surface, so every branch is unit-testable without a temp dir. The
 * bin (`cli/main.ts`) is the only thing that binds it to the real `node:fs`.
 */

import {
  ALL_PLUGINS,
  resolveProjects,
  type ClientName,
  type LatheSection,
  type PluginName,
  type ResolvedConfig,
  type ValidatorName,
} from '../core/config'
import { ALL_CLIENTS } from '../emit/client-runtime'
import { ALL_VALIDATORS } from '../emit/validator'
import { generate } from '../core/generate'
import { noteSeverity, type IrNote, type IrNoteSeverity, type Reach } from '../core/ir'
import { OUTPUT_MANIFEST, orphanedPaths } from '../core/output-manifest'
import { diffCommittedSurface, type ApiSurface, type SurfaceChange } from '../core/surface'
import { resolveTransform, verifyNative, worstVerdict } from '../verify/lower'
import { closest } from '../core/suggest'
import { renderReport } from './report'

export interface Argv {
  command: 'generate' | 'check' | 'pull' | 'help' | 'version'
  /**
   * Positional spec path, overriding config. For `pull`, the URL.
   */
  input?: string | undefined
  /** `pull` only: where to write the spec, overriding the configured `input`. */
  dest?: string | undefined
  output?: string | undefined
  target?: 'web' | 'multiplatform' | undefined
  plugins?: readonly PluginName[] | undefined
  client?: ClientName | undefined
  validator?: ValidatorName | undefined
  baseUrl?: string | undefined
  /** An explicit config file, instead of searching upward from the cwd. */
  config?: string | undefined
  /** `pull` only: extra request headers, `Name: value`. Repeatable. */
  headers: string[]
  /** `pull` only: sent as `Authorization: Bearer <token>`. */
  token?: string | undefined
  strictNative: boolean
  /** Exit non-zero when the spec change breaks the existing client contract. */
  failOnBreaking: boolean
  json: boolean
  /** Regenerate whenever a spec changes, instead of exiting after one pass. */
  watch: boolean
  /** Report what `generate` WOULD write and remove, and touch nothing. */
  dryRun: boolean
  /**
   * Colour the terminal report. `undefined` means "decide from the
   * environment", which only the bin can do; the pure run defaults to plain.
   */
  color?: boolean | undefined
  /**
   * Everything the parser refused: an unknown flag, a missing or invalid
   * value, an unknown command. A non-empty list means the run does NOTHING.
   */
  errors: string[]
}

const COMMANDS = ['generate', 'check', 'pull', 'help', 'version'] as const
const TARGETS = ['web', 'multiplatform'] as const

/**
 * Every flag, with whether it takes a value.
 *
 * ONE table, read by the parser, the did-you-mean suggester and the help
 * test. An unknown flag used to be IGNORED -- `lathe generate --josn` wrote a
 * client and printed a human report, and `--targt native` generated for the
 * web -- so a typo was indistinguishable from a flag that works.
 */
const FLAGS: Readonly<Record<string, 'bool' | 'value'>> = {
  '--json': 'bool',
  '--watch': 'bool',
  '-w': 'bool',
  '--strict-native': 'bool',
  '--fail-on-breaking': 'bool',
  '--dry-run': 'bool',
  '--color': 'bool',
  '--no-color': 'bool',
  '--help': 'bool',
  '-h': 'bool',
  '--version': 'bool',
  '-v': 'bool',
  '--target': 'value',
  '--out': 'value',
  '--output': 'value',
  '--base-url': 'value',
  '--client': 'value',
  '--validator': 'value',
  '--plugins': 'value',
  '--config': 'value',
  '--header': 'value',
  '--token': 'value',
}

/** The flag names a user could have meant, for "did you mean" hints. */
export const KNOWN_FLAGS: readonly string[] = Object.keys(FLAGS)

export function parseArgv(args: readonly string[]): Argv {
  const out: Argv = {
    command: 'help',
    headers: [],
    strictNative: false,
    failOnBreaking: false,
    json: false,
    watch: false,
    dryRun: false,
    errors: [],
  }
  const rest: string[] = []
  let helpRequested = false
  let versionRequested = false
  const oneOf = <T extends string>(flag: string, value: string, allowed: readonly T[]): T | undefined => {
    if ((allowed as readonly string[]).includes(value)) return value as T
    out.errors.push(
      `\`${flag}\` must be one of ${allowed.join(', ')}; got \`${value}\`.${hint(value, allowed)}`,
    )
    return undefined
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--') {
      rest.push(...args.slice(i + 1))
      break
    }
    if (!a.startsWith('-') || a === '-') {
      rest.push(a)
      continue
    }
    const eq = a.indexOf('=')
    const name = a.startsWith('--') && eq > 0 ? a.slice(0, eq) : a
    const kind = FLAGS[name]
    if (!kind) {
      out.errors.push(`unknown option \`${name}\`.${hint(name, KNOWN_FLAGS)}`)
      continue
    }
    let value: string | undefined
    if (kind === 'value') {
      if (eq > 0 && name !== a) {
        value = a.slice(eq + 1)
      } else {
        const next = args[i + 1]
        // A value that looks like a FLAG is not a value: `--out --json` must
        // not write the tree into a directory named `--json`.
        if (next === undefined || (next.startsWith('-') && next !== '-')) {
          out.errors.push(`\`${name}\` needs a value.`)
          continue
        }
        value = next
        i++
      }
    } else if (eq > 0 && name !== a) {
      out.errors.push(`\`${name}\` takes no value.`)
      continue
    }
    switch (name) {
      case '--json':
        out.json = true
        break
      case '--watch':
      case '-w':
        out.watch = true
        break
      case '--strict-native':
        out.strictNative = true
        break
      case '--fail-on-breaking':
        out.failOnBreaking = true
        break
      case '--dry-run':
        out.dryRun = true
        break
      case '--color':
        out.color = true
        break
      case '--no-color':
        out.color = false
        break
      case '--help':
      case '-h':
        helpRequested = true
        break
      case '--version':
      case '-v':
        versionRequested = true
        break
      case '--target':
        out.target = oneOf(name, value as string, TARGETS)
        break
      case '--out':
      case '--output':
        out.output = value
        break
      case '--base-url':
        out.baseUrl = value
        break
      case '--client':
        out.client = oneOf(name, value as string, ALL_CLIENTS)
        break
      case '--validator':
        out.validator = oneOf(name, value as string, ALL_VALIDATORS)
        break
      case '--plugins': {
        const list = (value as string).split(',').map((s) => s.trim()).filter(Boolean)
        const bad = list.filter((pl) => !(ALL_PLUGINS as readonly string[]).includes(pl))
        for (const b of bad) out.errors.push(`unknown plugin \`${b}\`.${hint(b, ALL_PLUGINS)} Known: ${ALL_PLUGINS.join(', ')}.`)
        if (bad.length === 0) out.plugins = list as PluginName[]
        break
      }
      case '--config':
        out.config = value
        break
      case '--header':
        if (!/^[^:\s]+:/.test(value as string)) {
          out.errors.push(`\`--header\` takes \`Name: value\`; got \`${value}\`.`)
        } else {
          out.headers.push(value as string)
        }
        break
      case '--token':
        out.token = value
        break
    }
  }

  const verb = rest[0]
  if (verb !== undefined && (COMMANDS as readonly string[]).includes(verb)) {
    out.command = verb as Argv['command']
    const positional = rest.slice(1)
    const max = verb === 'pull' ? 2 : verb === 'generate' || verb === 'check' ? 1 : 0
    if (positional[0] !== undefined) out.input = positional[0]
    if (verb === 'pull' && positional[1] !== undefined) out.dest = positional[1]
    for (const extra of positional.slice(max)) out.errors.push(`unexpected argument \`${extra}\`.`)
  } else if (verb !== undefined) {
    // `lathe ./openapi.yaml` -- a bare PATH is `generate`. A bare WORD is
    // almost always a mistyped command (`lathe generat`), and treating it as a
    // spec path reports "spec not found at generat", which reads as a missing
    // file rather than a typo.
    if (/[./\\]/.test(verb)) {
      out.command = 'generate'
      out.input = verb
      for (const extra of rest.slice(1)) out.errors.push(`unexpected argument \`${extra}\`.`)
    } else {
      out.errors.push(`unknown command \`${verb}\`.${hint(verb, COMMANDS)}`)
    }
  }
  // `--help` WINS over the verb. `lathe generate --help` previously ran a
  // generate: the one flag a user types when they are unsure wrote a
  // client into their repo instead of explaining itself. Every CLI they
  // know (`git commit --help`, `npm install --help`) prints help there.
  if (versionRequested) out.command = 'version'
  if (helpRequested) out.command = 'help'
  if (out.command === 'pull' && (out.dryRun || out.watch)) {
    out.errors.push(`\`${out.dryRun ? '--dry-run' : '--watch'}\` does not apply to \`pull\`.`)
  }
  if (out.command !== 'pull' && (out.headers.length > 0 || out.token !== undefined)) {
    out.errors.push('`--header` and `--token` only apply to `lathe pull`.')
  }
  if (out.command === 'check' && out.dryRun) {
    out.errors.push('`--dry-run` is implied by `check`, which never writes.')
  }
  return out
}

/** ` Did you mean \`x\`?` when something close exists, else `''`. */
function hint(input: string, candidates: readonly string[]): string {
  const best = closest(input, candidates)
  return best ? ` Did you mean \`${best}\`?` : ''
}

export interface Fs {
  read(path: string): string
  write(path: string, contents: string): void
  exists(path: string): boolean
  mkdirp(path: string): void
  /** Delete one file. Only ever called for a path a previous run generated. */
  remove(path: string): void
  join(...parts: string[]): string
}

export interface RunResult {
  code: number
  /** The report, or the `--json` document. */
  stdout: string
  /** Errors and diagnostics in human mode. Always empty under `--json`. */
  stderr: string
}

export const HELP = `lathe - generate Pyreon clients from an OpenAPI 3.x spec

Usage
  lathe generate [spec]          read the spec, write the client
  lathe check    [spec]          generate in memory; exit 1 if anything is stale
  lathe pull     [url] [dest]    fetch a remote spec to the configured input path
  lathe [spec]                   same as \`lathe generate [spec]\`

Options
  --target web|multiplatform     emit native modules and verify them (default: web)
  --out, --output <dir>          output directory (default: ./src/gen)
  --base-url <url>               override servers[0].url; must be absolute to reach native
  --plugins a,b                  ${ALL_PLUGINS.join(',')}
                                 (default: schemas,client,queries)
  --client ${ALL_CLIENTS.join('|')}    HTTP runtime (default: pyreon; only pyreon reaches native)
  --validator ${ALL_VALIDATORS.join('|')}         schema library (default: pyreon; both reach native)
  --config <file>                config file (default: nearest pyreon.config.* upward)
  --dry-run                      report what generate would write and remove; touch nothing
  --strict-native                exit 1 when a native module fails to lower
  --fail-on-breaking             exit 1 when the spec breaks the client contract;
                                 pair with generate, whose run causes the change
  --json                         machine-readable output (one shape; see the README)
  --watch, -w                    regenerate when a spec or the config changes
  --color, --no-color            force colour on or off (default: on for a TTY, off
                                 when NO_COLOR is set)
  --version, -v                  print the version
  --help, -h                     print this help

Pull options
  --header "Name: value"         send a request header (repeatable)
  --token <token>                send \`Authorization: Bearer <token>\`
                                 (default: $LATHE_TOKEN when set)

Paths in pyreon.config.* are relative to the config file; paths on the command
line are relative to the working directory.
`

/** The one `--json` document every command produces. */
export interface JsonReport {
  /** `true` when the run succeeded, i.e. exited 0. */
  ok: boolean
  command: Argv['command']
  /** One entry per generated project; a single-project config yields one. */
  projects: JsonProject[]
  /** Present when the run failed before producing a project report. */
  error?: { message: string } | undefined
}

export interface JsonProject {
  /** Project name, or `''` for a single-project config. */
  name: string
  title: string
  version: string
  models: number
  operations: number
  target: 'web' | 'multiplatform'
  output: string
  files: string[]
  wrote: number
  removed: string[]
  stale: string[]
  dryRun: boolean
  reach: Record<string, { reach: Reach; reason?: string }>
  notes: Array<IrNote & { severity: IrNoteSeverity }>
  verify: ReturnType<typeof verifyNative>
  changes: SurfaceChange[]
}

/**
 * Run a command.
 *
 * `check` never writes. It is the CI half: regenerate in memory, compare, and
 * fail when the committed output is stale — the same shape as this repo's
 * `gen-docs --check`, and for the same reason. Generated code that has drifted
 * from its spec is worse than absent code, because it still looks authoritative.
 *
 * NEVER throws for a user error: a bad flag, a missing spec, a refused
 * document and a config that cannot resolve all become exit code 1 with the
 * message on stderr -- or, under `--json`, a JSON document with `ok: false`,
 * so a script parsing stdout is never handed plain text.
 */
export async function run(
  argv: Argv,
  section: LatheSection | undefined,
  fs: Fs,
): Promise<RunResult> {
  const fail = (message: string, code = 1): RunResult => {
    if (argv.json) {
      const doc: JsonReport = { ok: false, command: argv.command, projects: [], error: { message } }
      return { code, stdout: `${JSON.stringify(doc, null, 2)}\n`, stderr: '' }
    }
    return { code, stdout: '', stderr: `${message}\n` }
  }
  if (argv.errors.length > 0) {
    return fail(
      `[Pyreon] lathe: ${argv.errors.join('\n  ')}\n  Run \`lathe --help\` for usage.`,
      2,
    )
  }
  if (argv.command === 'help') return { code: 0, stdout: HELP, stderr: '' }
  try {
    return await runChecked(argv, section, fs, fail)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

async function runChecked(
  argv: Argv,
  section: LatheSection | undefined,
  fs: Fs,
  fail: (message: string, code?: number) => RunResult,
): Promise<RunResult> {
  const merged: LatheSection = {
    ...section,
    ...(argv.input ? { input: argv.input } : {}),
    ...(argv.output ? { output: argv.output } : {}),
    ...(argv.target ? { target: argv.target } : {}),
    ...(argv.plugins ? { plugins: argv.plugins } : {}),
    ...(argv.client ? { client: argv.client } : {}),
    ...(argv.validator ? { validator: argv.validator } : {}),
    ...(argv.baseUrl ? { baseUrl: argv.baseUrl } : {}),
    ...(argv.strictNative ? { strictNative: true } : {}),
  }
  // A CLI-supplied `--out` / spec path cannot address one project among many,
  // so passing either alongside `projects` is refused rather than applied to
  // all of them (which would write every client to one directory).
  if (merged.projects && merged.projects.length > 0 && (argv.input || argv.output)) {
    return fail(
      '[Pyreon] lathe: this config declares `lathe.projects`, so a CLI spec path or `--out` is ambiguous. Set them per project in the config.',
    )
  }

  const projects = resolveProjects(merged)
  // TWO PHASES: every project is generated before any is written. A spec that
  // is refused (Swagger 2, not a spec at all, unparseable) must leave EVERY
  // output tree untouched -- including the ones listed before it -- rather than
  // leaving a monorepo half-regenerated against a run that failed.
  const generated: Array<{ config: ResolvedConfig; result: ReturnType<typeof generate> }> = []
  // The project's native compiler, resolved at most ONCE and only when a run
  // actually produced a native module. A `web` target has nothing for it to
  // verify, and importing it anyway cost every web run the module load of the
  // whole compiler (measured 0.25-0.5 s wall in isolation when installed).
  let transform: Promise<Awaited<ReturnType<typeof resolveTransform>>> | undefined
  for (const config of projects) {
    if (!fs.exists(config.input)) {
      return fail(
        `[Pyreon] lathe: spec not found at ${config.input}${config.name ? ` (project \`${config.name}\`)` : ''}`,
      )
    }
    try {
      generated.push({ config, result: generate(fs.read(config.input), config) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Name WHICH spec in a multi-project run; the error itself cannot know.
      throw new Error(config.name ? `${message}\n  (project \`${config.name}\`, ${config.input})` : message, {
        cause: err,
      })
    }
  }

  // `check` and `--dry-run` compute everything and write nothing.
  const writes = argv.command === 'generate' && !argv.dryRun
  const runs: RunOutcome[] = []
  for (const { config, result } of generated) {
    const needsNative = result.files.some((f) => f.path.endsWith('.native.tsx'))
    if (needsNative) transform ??= resolveTransform()
    const verify = verifyNative(result.files, needsNative ? await transform : undefined)

    // Read the PREVIOUS surface before the write loop overwrites it. This is
    // the only moment both versions exist, and it is what turns "your spec
    // changed" into "your spec removed a field the app reads".
    const changes = compareSurface(fs, config.output, result.surface)

    // Read the previous manifest BEFORE the loop rewrites it, for the same
    // reason as the surface: afterwards only the new version exists.
    const manifestPath = fs.join(config.output, OUTPUT_MANIFEST)
    const orphans = orphanedPaths(
      fs.exists(manifestPath) ? fs.read(manifestPath) : undefined,
      result.files.map((f) => f.path),
    ).filter((p) => fs.exists(fs.join(config.output, p)))

    let wrote = 0
    const stale: string[] = []
    // WHICH paths changed, not just how many. The report used to mark every
    // file with a green `+` and then say "1 file(s) written" underneath —
    // fourteen lines that read as "created" for one file that actually moved.
    // On a spec edit the useful signal is exactly which outputs it moved.
    const changed = new Set<string>()
    const created = new Set<string>()
    for (const file of result.files) {
      const full = fs.join(config.output, file.path)
      const existed = fs.exists(full)
      const current = existed ? fs.read(full) : undefined
      if (current === file.contents) continue
      if (!existed) created.add(file.path)
      changed.add(file.path)
      if (!writes) {
        stale.push(file.path)
        continue
      }
      fs.mkdirp(dirOf(full))
      fs.write(full, file.contents)
      wrote++
    }
    // Files the previous run generated and this one does not -- a tag the spec
    // dropped, a plugin that was turned off. `check` reports them as stale;
    // `generate` removes them. Only paths the manifest lists are candidates,
    // so a hand-written file in the output directory is never touched.
    const removed: string[] = []
    for (const orphan of orphans) {
      if (!writes) {
        stale.push(`${orphan} (orphaned: no longer generated)`)
        continue
      }
      fs.remove(fs.join(config.output, orphan))
      removed.push(orphan)
    }
    runs.push({ config, result, verify, wrote, stale, changed, created, changes, removed })
  }

  return report(runs, argv)
}

interface RunOutcome {
  config: ResolvedConfig
  result: ReturnType<typeof generate>
  verify: ReturnType<typeof verifyNative>
  wrote: number
  stale: string[]
  /** Paths whose contents differ from what is on disk. */
  changed: Set<string>
  /** The subset of `changed` that did not exist before — new, not updated. */
  created: Set<string>
  /** Contract changes vs the committed surface. Empty on a first run. */
  changes: SurfaceChange[]
  /** Previously-generated files this run removed because it no longer emits them. */
  removed: string[]
}

function report(runs: RunOutcome[], argv: Argv): RunResult {
  const worst = (a: number, b: number): number => Math.max(a, b)
  const code = runs
    .map(({ config, verify, stale, changes }) =>
      exitCode(config.strictNative, verify, stale, argv.command, argv.failOnBreaking, changes),
    )
    .reduce(worst, 0)
  if (argv.json) {
    // ONE shape whatever the project count. A single project used to be a flat
    // object and several were `{ projects: [...] }`, so every consumer had to
    // branch on a property that was not documented.
    const doc: JsonReport = {
      ok: code === 0,
      command: argv.command,
      projects: runs.map(({ config, result, verify, wrote, stale, changes, removed }) => ({
        name: config.name,
        title: result.doc.title,
        version: result.doc.version,
        models: result.doc.models.length,
        operations: result.doc.operations.length,
        target: config.target,
        output: config.output,
        files: result.files.map((f) => f.path),
        wrote,
        removed,
        stale,
        dryRun: argv.dryRun,
        reach: Object.fromEntries(result.reach),
        // `severity` is derived from the code, and attached here so a JSON
        // consumer need not carry the code->severity table itself.
        notes: result.doc.notes.map((n) => ({ ...n, severity: noteSeverity(n) })),
        verify,
        changes,
      })),
    }
    return { code, stdout: `${JSON.stringify(doc, null, 2)}\n`, stderr: '' }
  }

  let stdout = ''
  for (const { config, result, verify, wrote, stale, changed, created, changes, removed } of runs) {
    stdout += renderReport(result, verify, {
      target: config.target,
      output: config.output,
      wrote,
      changed,
      created,
      changes,
      removed,
      name: config.name,
      plugins: config.plugins,
      requestedPlugins: config.requestedPlugins,
      color: argv.color ?? false,
    })
    if (argv.command === 'check' && stale.length > 0) {
      stdout += `\n  STALE: ${stale.length} generated file(s) differ from the spec:\n${stale
        .map((s) => `    ${s}`)
        .join('\n')}\n\n  Fix: run \`lathe generate\` and commit the result.\n`
    }
    if (argv.dryRun && stale.length > 0) {
      stdout += `\n  DRY RUN: \`lathe generate\` would change ${stale.length} path(s):\n${stale
        .map((s) => `    ${s}`)
        .join('\n')}\n`
    } else if (argv.dryRun) {
      stdout += '\n  DRY RUN: nothing would change.\n'
    }
  }
  return { code, stdout, stderr: '' }
}

function exitCode(
  strictNative: boolean,
  verify: ReturnType<typeof verifyNative>,
  stale: string[],
  command: Argv['command'],
  failOnBreaking: boolean,
  changes: readonly SurfaceChange[],
): number {
  if (command === 'check' && stale.length > 0) return 1
  // Opt-in, and deliberately so: on a feature branch the spec is SUPPOSED to
  // move, and a gate that fires there gets disabled rather than heeded. In CI
  // on a release branch it is exactly the signal you want.
  if (failOnBreaking && changes.some((c) => c.severity === 'breaking')) return 1
  if (!strictNative) return 0
  // `--strict-native` means the app intends to ship native. A SKIPPED
  // verification must fail there too: "we could not check" is not "it is fine",
  // and treating it as a pass is exactly the dead-gate shape this repo bans.
  const worst = worstVerdict(verify)
  return worst === 'lowers' ? 0 : 1
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '.' : path.slice(0, i)
}

/** The committed surface from the last run, diffed against this one. */
function compareSurface(fs: Fs, output: string, now: ApiSurface): SurfaceChange[] {
  const path = fs.join(output, 'api-surface.json')
  return diffCommittedSurface(fs.exists(path) ? fs.read(path) : undefined, now)
}
