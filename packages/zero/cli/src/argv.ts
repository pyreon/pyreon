// ─── Command-line parsing for the `zero` binary ─────────────────────────────
//
// First-party replacement for `cac` (and the `mri` parser it bundles). The
// `zero` CLI declares six commands and a dozen options; this module is the
// subset of cac's model those declarations use, reproducing its observable
// behaviour exactly — which command runs, what the action receives, which
// argv is rejected and with what message, and the text `--help` / `--version`
// print. `cli.test.ts` pins all of it against a matrix recorded from cac
// itself before the swap.
//
// The parsing rules, in cac's own terms:
//
//   - Options are `--name`, `--name=value`, `--name value`, `-x`, and short
//     clusters `-abc` (three booleans). `--no-name` sets `name` to `false`.
//   - A value-taking option consumes the next argument unless that argument
//     starts with `-`; with none left it reads as `true`.
//   - A value that looks numeric becomes a number (`--port 3000` → 3000,
//     `--host 127` → 127). Positional arguments stay strings.
//   - A BOOLEAN option given a value that is not `true`/`false`
//     (`--open x`) keeps `true` and hands the value back as a positional.
//   - Repeating an option collects an array.
//   - Option names are camelCased (`--dry-run` → `dryRun`), and
//     `-h`/`--help`, `-v`/`--version` fill both spellings.
//   - Everything after `--` lands in `options['--']`, untouched.
//   - The command is the one whose name (or alias) is the first positional;
//     failing that, the default command (`[root]`) runs with every
//     positional as its arguments.

/** Thrown for argv the declared commands reject. */
export class CliUsageError extends Error {
  override name = 'CliUsageError'
}

export interface OptionSpec {
  /** As written in help: `--port <port>`, `-h, --help`, `--host [host]`. */
  rawName: string
  description: string
}

export interface CommandSpec {
  /** As written in help: `[root]`, `build [root]`, `create [...args]`. */
  rawName: string
  description: string
  aliases?: string[]
  options?: OptionSpec[]
  /** Accept options the command does not declare (forwarded commands). */
  allowUnknownOptions?: boolean
  action: (...args: never[]) => unknown
}

export interface CliSpec {
  name: string
  version: string
  commands: CommandSpec[]
}

export type ParsedOptions = Record<string, unknown> & { '--': string[] }

interface Option {
  rawName: string
  description: string
  /** Every spelling, camelCased, shortest first. */
  names: string[]
  /** The longest spelling — the key a handler reads. */
  name: string
  kind: 'boolean' | 'required' | 'optional'
}

interface Command {
  rawName: string
  description: string
  name: string
  aliases: string[]
  args: Array<{ required: boolean; variadic: boolean }>
  options: Option[]
  allowUnknownOptions: boolean
  action: (...args: unknown[]) => unknown
}

const GLOBAL_OPTIONS: OptionSpec[] = [
  { rawName: '-h, --help', description: 'Display this message' },
  { rawName: '-v, --version', description: 'Display version number' },
]

function camelcase(name: string): string {
  const [first = '', ...rest] = name.split('.')
  return [first.replace(/([a-z])-([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()), ...rest].join('.')
}

function toOption(spec: OptionSpec): Option {
  const bare = spec.rawName.replace(/[<[].+/, '').trim()
  const names = bare
    .split(',')
    .map((part) => camelcase(part.trim().replace(/^-{1,2}/, '').replace(/^no-/, '')))
    .sort((a, b) => a.length - b.length)
  return {
    rawName: spec.rawName,
    description: spec.description,
    names,
    name: names[names.length - 1] as string,
    kind: spec.rawName.includes('<') ? 'required' : spec.rawName.includes('[') ? 'optional' : 'boolean',
  }
}

function toCommand(spec: CommandSpec): Command {
  const args: Command['args'] = []
  for (const m of spec.rawName.matchAll(/<([^>]+)>|\[([^\]]+)\]/g)) {
    const value = (m[1] ?? m[2]) as string
    args.push({ required: m[1] !== undefined, variadic: value.startsWith('...') })
  }
  return {
    rawName: spec.rawName,
    description: spec.description,
    name: spec.rawName.replace(/[<[].+/, '').trim(),
    aliases: spec.aliases ?? [],
    args,
    options: (spec.options ?? []).map(toOption),
    allowUnknownOptions: spec.allowUnknownOptions === true,
    action: spec.action as (...args: unknown[]) => unknown,
  }
}

/** `+value` when that is a finite number, else the value (mri's rule). */
function coerce(value: string): string | number {
  const n = +value
  return Number.isFinite(n) ? n : value
}

interface Tokens {
  positionals: Array<string | number>
  options: Record<string, unknown>
}

/**
 * Split argv into positionals and options given the boolean option names
 * and the alias groups — `mri`'s algorithm, which cac ran per command.
 */
function tokenize(argv: readonly string[], options: readonly Option[]): Tokens {
  const booleans = new Set<string>()
  const aliases = new Map<string, string[]>()
  for (const option of options) {
    if (option.names.length > 1) {
      for (const name of option.names) aliases.set(name, option.names.filter((n) => n !== name))
    }
    if (option.kind === 'boolean') for (const name of option.names) booleans.add(name)
  }

  const out: Record<string, unknown> = {}
  const positionals: Array<string | number> = []
  const set = (key: string, value: string | boolean) => {
    let next: unknown
    if (typeof value === 'boolean') next = value
    else if (booleans.has(key)) {
      if (value === 'false') next = false
      else {
        if (value !== 'true') positionals.push(coerce(value))
        next = value !== ''
      }
    } else next = coerce(value)
    const old = out[key]
    out[key] = old === undefined ? next : Array.isArray(old) ? old.concat(next) : [old, next]
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    let dashes = 0
    while (dashes < arg.length && arg.charCodeAt(dashes) === 45) dashes++
    if (dashes === 0) {
      positionals.push(arg)
      continue
    }
    if (arg.startsWith('no-', dashes)) {
      out[arg.slice(dashes + 3)] = false
      continue
    }
    let eq = dashes + 1
    while (eq < arg.length && arg.charCodeAt(eq) !== 61) eq++
    const name = arg.slice(dashes, eq)
    const inline = arg.slice(eq + 1)
    let value: string | boolean
    if (inline !== '') value = inline
    else if (i + 1 === argv.length || (argv[i + 1] as string).charCodeAt(0) === 45) value = true
    else value = argv[++i] as string
    // `--long` is one name; `-abc` (and `---x`) is a cluster of single
    // letters, each `true` except the last, which takes the value.
    const names = dashes === 2 ? [name] : [...name]
    names.forEach((n, idx) => set(n, idx + 1 < names.length ? true : value))
  }

  for (const [key, group] of aliases) {
    if (key in out) for (const alias of group) out[alias] = out[key]
  }
  const camel: Record<string, unknown> = {}
  for (const key of Object.keys(out)) camel[camelcase(key)] = out[key]
  return { positionals, options: camel }
}

function parseFor(argv: readonly string[], command: Command, globals: readonly Option[]) {
  const dd = argv.indexOf('--')
  const head = dd === -1 ? argv : argv.slice(0, dd)
  const tail = dd === -1 ? [] : argv.slice(dd + 1)
  const { positionals, options } = tokenize(head, [...globals, ...command.options])
  return { positionals, options: { '--': tail, ...options } as ParsedOptions }
}

function padRight(str: string, length: number): string {
  return str.length >= length ? str : str + ' '.repeat(length - str.length)
}

function formatHelp(cli: CliSpec, command: Command, commands: readonly Command[], globals: readonly Option[]): string {
  const sections: Array<{ title?: string; body: string }> = [
    { body: `${cli.name}/${cli.version}` },
    { title: 'Usage', body: `  $ ${cli.name} ${command.rawName}` },
  ]
  if (command.name === '') {
    const width = Math.max(...commands.map((c) => c.rawName.length))
    sections.push(
      {
        title: 'Commands',
        body: commands.map((c) => `  ${padRight(c.rawName, width)}  ${c.description}`).join('\n'),
      },
      {
        title: 'For more info, run any command with the `--help` flag',
        body: commands.map((c) => `  $ ${cli.name}${c.name === '' ? '' : ` ${c.name}`} --help`).join('\n'),
      },
    )
  }
  let options = [...command.options, ...globals]
  if (command.name !== '') options = options.filter((o) => o.name !== 'version')
  const width = Math.max(...options.map((o) => o.rawName.length))
  sections.push({
    title: 'Options',
    body: options.map((o) => `  ${padRight(o.rawName, width)}  ${o.description}`).join('\n'),
  })
  return sections.map((s) => (s.title ? `${s.title}:\n${s.body}` : s.body)).join('\n\n')
}

function runtimeInfo(): string {
  const g = globalThis as { Deno?: { version?: { deno?: unknown } }; Bun?: { version?: unknown } }
  const runtime =
    typeof g.Deno?.version?.deno === 'string' ? 'deno' : typeof g.Bun?.version === 'string' ? 'bun' : 'node'
  return `${process.platform}-${process.arch} ${runtime}-${process.version}`
}

/**
 * Parse `argv` (the arguments AFTER the binary, i.e. `process.argv.slice(2)`)
 * against `cli` and run the matching command's action, returning whatever it
 * returns. `--help` / `--version` print through `print` and return
 * `undefined` without running anything. Throws {@link CliUsageError} for an
 * unknown option, an option missing its value, or surplus arguments.
 */
export function runCli(
  cli: CliSpec,
  argv: readonly string[],
  print: (text: string) => void = (text) => console.info(text),
): unknown {
  const commands = cli.commands.map(toCommand)
  const globals = GLOBAL_OPTIONS.map(toOption)

  let command: Command | undefined
  let matchedName: string | undefined
  let parsed: ReturnType<typeof parseFor> | undefined
  for (const candidate of commands) {
    const p = parseFor(argv, candidate, globals)
    const first = p.positionals[0]
    if (candidate.name === first || candidate.aliases.includes(first as string)) {
      command = candidate
      matchedName = first as string
      parsed = { positionals: p.positionals.slice(1), options: p.options }
    }
  }
  if (!command) {
    command = commands.find((c) => c.name === '')
    if (!command) throw new CliUsageError('no default command declared')
    parsed = parseFor(argv, command, globals)
  }
  const { positionals, options } = parsed as NonNullable<typeof parsed>

  // Help and version are independent: `zero -v --help` prints both, and
  // neither runs the command.
  let handled = false
  if (options.help) {
    print(formatHelp(cli, command, commands, globals))
    handled = true
  }
  if (options.version && matchedName === undefined) {
    print(`${cli.name}/${cli.version} ${runtimeInfo()}`)
    handled = true
  }
  if (handled) return undefined

  const known = (name: string) => {
    const key = name.split('.')[0] as string
    return [...command.options, ...globals].some((o) => o.names.includes(key))
  }
  if (!command.allowUnknownOptions) {
    for (const name of Object.keys(options)) {
      if (name !== '--' && !known(name)) {
        throw new CliUsageError(`Unknown option \`${name.length > 1 ? `--${name}` : `-${name}`}\``)
      }
    }
  }
  for (const option of [...globals, ...command.options]) {
    if (option.kind !== 'required') continue
    const value = options[option.name.split('.')[0] as string]
    if (value === true || value === false) {
      throw new CliUsageError(`option \`${option.rawName}\` value is missing`)
    }
  }
  const required = command.args.filter((a) => a.required).length
  if (positionals.length < required) {
    throw new CliUsageError(`missing required args for command \`${command.rawName}\``)
  }
  const max = command.args.some((a) => a.variadic) ? Infinity : command.args.length
  if (positionals.length > max) {
    throw new CliUsageError(
      `Unused args: ${positionals
        .slice(max)
        .map((a) => `\`${a}\``)
        .join(', ')}`,
    )
  }

  const actionArgs: unknown[] = command.args.map((arg, i) => (arg.variadic ? positionals.slice(i) : positionals[i]))
  actionArgs.push(options)
  return command.action(...actionArgs)
}
