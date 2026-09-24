/**
 * Argument parsing for the loom CLI.
 *
 * Every command declares the flags it accepts, and anything else is an ERROR.
 * Before this, an unknown flag was ignored and a spaced value (`--out site`,
 * `--port 5391`) was read as the directory argument, so a typo scanned or
 * built the wrong thing and reported success.
 */
import { closest } from '../core/closest'

export interface FlagSpec {
  /** Flags that take no value (`--strict`). */
  readonly booleans: readonly string[]
  /** Flags that take a value, as `--out=x` or `--out x`. */
  readonly values: readonly string[]
  /** Positional arguments the command accepts. */
  readonly maxPositionals: number
}

export interface ParsedArgs {
  readonly flags: ReadonlySet<string>
  readonly values: ReadonlyMap<string, string>
  readonly positionals: readonly string[]
}

export type ParseResult = { ok: true; args: ParsedArgs } | { ok: false; error: string }

export function parseArgs(argv: readonly string[], spec: FlagSpec): ParseResult {
  const flags = new Set<string>()
  const values = new Map<string, string>()
  const positionals: string[] = []
  const known = [...spec.booleans, ...spec.values]

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    if (spec.values.includes(name)) {
      let value: string | undefined
      if (eq !== -1) value = arg.slice(eq + 1)
      else {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('-')) {
          value = next
          i += 1
        }
      }
      if (value === undefined || value === '') return { ok: false, error: `${name} needs a value (${name}=<value>).` }
      values.set(name, value)
      continue
    }
    if (spec.booleans.includes(name)) {
      if (eq !== -1) return { ok: false, error: `${name} does not take a value.` }
      flags.add(name)
      continue
    }
    const guess = closest(name, known)
    return {
      ok: false,
      error: `unknown option ${name}.${guess ? ` Did you mean ${guess}?` : ''}`,
    }
  }

  if (positionals.length > spec.maxPositionals) {
    const extra = positionals.slice(spec.maxPositionals)
    return {
      ok: false,
      error: `unexpected argument${extra.length > 1 ? 's' : ''} ${extra.map((e) => `"${e}"`).join(', ')}.`,
    }
  }
  return { ok: true, args: { flags, values, positionals } }
}
