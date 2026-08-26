/**
 * `lathe generate` / `lathe check`.
 *
 * Pure argv parsing and a run function that takes its filesystem as an
 * injected surface, so every branch is unit-testable without a temp dir. The
 * bin (`cli/main.ts`) is the only thing that binds it to the real `node:fs`.
 */

import { resolveConfig, type LatheSection, type PluginName } from '../core/config'
import { generate } from '../core/generate'
import { resolveTransform, verifyNative, worstVerdict } from '../verify/lower'
import { renderReport } from './report'

export interface Argv {
  command: 'generate' | 'check' | 'help'
  /** Positional spec path, overriding config. */
  input?: string | undefined
  output?: string | undefined
  target?: 'web' | 'multiplatform' | undefined
  plugins?: readonly PluginName[] | undefined
  baseUrl?: string | undefined
  strictNative: boolean
  json: boolean
}

export function parseArgv(args: readonly string[]): Argv {
  const out: Argv = { command: 'help', strictNative: false, json: false }
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--json') out.json = true
    else if (a === '--strict-native') out.strictNative = true
    else if (a === '--target') out.target = args[++i] as Argv['target']
    else if (a.startsWith('--target=')) out.target = a.slice(9) as Argv['target']
    else if (a === '--out' || a === '--output') out.output = args[++i]
    else if (a.startsWith('--out=')) out.output = a.slice(6)
    else if (a === '--base-url') out.baseUrl = args[++i]
    else if (a.startsWith('--base-url=')) out.baseUrl = a.slice(11)
    else if (a === '--plugins') out.plugins = (args[++i] ?? '').split(',').filter(Boolean) as PluginName[]
    else if (a.startsWith('--plugins=')) out.plugins = a.slice(10).split(',').filter(Boolean) as PluginName[]
    else if (a === '-h' || a === '--help') out.command = 'help'
    else if (!a.startsWith('-')) rest.push(a)
  }
  const verb = rest[0]
  if (verb === 'generate' || verb === 'check') {
    out.command = verb
    if (rest[1]) out.input = rest[1]
  } else if (verb !== undefined && out.command === 'help') {
    // `lathe ./openapi.yaml` — treat a bare path as `generate`.
    out.command = 'generate'
    out.input = verb
  }
  return out
}

export interface Fs {
  read(path: string): string
  write(path: string, contents: string): void
  exists(path: string): boolean
  mkdirp(path: string): void
  join(...parts: string[]): string
}

export interface RunResult {
  code: number
  stdout: string
}

export const HELP = `lathe - generate Pyreon clients from an API spec

  lathe generate [spec]     read the spec, write the client
  lathe check    [spec]     generate in memory; fail if anything is stale

Options
  --target web|multiplatform   emit native modules and verify them (default: web)
  --out <dir>                  output directory (default: ./src/gen)
  --base-url <url>             override servers[0].url; must be absolute to reach native
  --plugins a,b                types,schemas,client,queries,mocks,atlas
  --strict-native              exit non-zero when a native module fails to lower
  --json                       machine-readable output
`

/**
 * Run a command.
 *
 * `check` never writes. It is the CI half: regenerate in memory, compare, and
 * fail when the committed output is stale — the same shape as this repo's
 * `gen-docs --check`, and for the same reason. Generated code that has drifted
 * from its spec is worse than absent code, because it still looks authoritative.
 */
export async function run(
  argv: Argv,
  section: LatheSection | undefined,
  fs: Fs,
): Promise<RunResult> {
  if (argv.command === 'help') return { code: 0, stdout: HELP }

  const merged: LatheSection = {
    ...section,
    ...(argv.input ? { input: argv.input } : {}),
    ...(argv.output ? { output: argv.output } : {}),
    ...(argv.target ? { target: argv.target } : {}),
    ...(argv.plugins ? { plugins: argv.plugins } : {}),
    ...(argv.baseUrl ? { baseUrl: argv.baseUrl } : {}),
    ...(argv.strictNative ? { strictNative: true } : {}),
  }
  const config = resolveConfig(merged)

  if (!fs.exists(config.input)) {
    return {
      code: 1,
      stdout: `[Pyreon] lathe: spec not found at ${config.input}\n`,
    }
  }
  const result = generate(fs.read(config.input), config)

  const verify = verifyNative(result.files, await resolveTransform())

  let wrote = 0
  const stale: string[] = []
  for (const file of result.files) {
    const full = fs.join(config.output, file.path)
    const current = fs.exists(full) ? fs.read(full) : undefined
    if (current === file.contents) continue
    if (argv.command === 'check') {
      stale.push(file.path)
      continue
    }
    fs.mkdirp(dirOf(full))
    fs.write(full, file.contents)
    wrote++
  }

  if (argv.json) {
    return {
      code: exitCode(config.strictNative, verify, stale, argv.command),
      stdout: `${JSON.stringify(
        {
          title: result.doc.title,
          version: result.doc.version,
          models: result.doc.models.length,
          operations: result.doc.operations.length,
          target: config.target,
          files: result.files.map((f) => f.path),
          wrote,
          stale,
          reach: Object.fromEntries(result.reach),
          notes: result.doc.notes,
          verify,
        },
        null,
        2,
      )}\n`,
    }
  }

  let stdout = renderReport(result, verify, {
    target: config.target,
    output: config.output,
    wrote,
  })
  if (argv.command === 'check' && stale.length > 0) {
    stdout += `\n  STALE: ${stale.length} generated file(s) differ from the spec:\n${stale
      .map((s) => `    ${s}`)
      .join('\n')}\n\n  Fix: run \`lathe generate\` and commit the result.\n`
  }
  return { code: exitCode(config.strictNative, verify, stale, argv.command), stdout }
}

function exitCode(
  strictNative: boolean,
  verify: ReturnType<typeof verifyNative>,
  stale: string[],
  command: Argv['command'],
): number {
  if (command === 'check' && stale.length > 0) return 1
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
