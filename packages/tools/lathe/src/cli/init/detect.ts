/**
 * Find what a project generates its API client from today.
 *
 * Read-only and file-based: another tool's config is parsed as text
 * (`./literal.ts`), never imported, so detection works whether or not that
 * tool is still installed and never runs its code.
 */

import {
  fromHeyApi,
  fromKubb,
  fromOpenapiTypescript,
  fromOrval,
  fromSpec,
  type Migration,
  type SourceTool,
} from './migrate'
import { readExportedConfig, type Lit } from './literal'

/** The filesystem detection needs. Paths are relative to the project root. */
export interface DetectFs {
  exists(path: string): boolean
  read(path: string): string
}

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']

const CONFIG_FILES: ReadonlyArray<[Exclude<SourceTool, 'openapi-typescript' | 'spec'>, string]> = [
  ['orval', 'orval.config'],
  ['hey-api', 'openapi-ts.config'],
  ['kubb', 'kubb.config'],
]

/** Where a bare spec usually lives, most likely first. */
const SPEC_DIRS = ['', 'api/', 'spec/', 'specs/', 'openapi/', 'docs/', 'schema/']
const SPEC_NAMES = ['openapi', 'openapi.v1', 'api', 'swagger', 'spec']
const SPEC_EXTENSIONS = ['yaml', 'yml', 'json']

export interface Detected {
  tool: SourceTool
  /** The file it was found in, relative to the project root. */
  file: string
  migrations: Migration[]
}

/**
 * Everything found, most specific first: a generator config (it carries the
 * most settings), then an openapi-typescript script, then a bare spec file.
 * `only` restricts the search to one tool.
 */
export function detect(fs: DetectFs, only?: SourceTool): Detected[] {
  const found: Detected[] = []
  for (const [tool, base] of CONFIG_FILES) {
    if (only && only !== tool) continue
    for (const ext of CONFIG_EXTENSIONS) {
      const file = `${base}.${ext}`
      if (!fs.exists(file)) continue
      const config = readExportedConfig(fs.read(file))
      const migrations = config
        ? tool === 'orval'
          ? fromOrval(config, file)
          : tool === 'hey-api'
            ? fromHeyApi(config, file)
            : fromKubb(config, file)
        : []
      found.push({ tool, file, migrations })
      break
    }
  }
  const pkg = readPackageJson(fs)
  // orval and hey-api run fine with NO config file, from flags alone
  // (`orval --input spec.yaml --output src/api.ts`). Such a setup lives in a
  // package.json script, so the scripts are read for the tools no config file
  // was found for.
  if (pkg) {
    for (const [tool, bin] of CLI_TOOLS) {
      if ((only && only !== tool) || found.some((d) => d.tool === tool)) continue
      const hit = fromScripts(fs, tool, bin, pkg.scripts ?? {})
      if (hit) found.push(hit)
    }
  }
  if ((!only || only === 'openapi-typescript') && pkg) {
    const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      if (typeof command === 'string' && /(^|[\s/])openapi-typescript(\s|$)/.test(command)) {
        found.push({
          tool: 'openapi-typescript',
          file: `package.json#scripts.${name}`,
          migrations: fromOpenapiTypescript({ name, command }, deps, `package.json#scripts.${name}`),
        })
        break
      }
    }
  }
  if (!only || only === 'spec') {
    for (const dir of SPEC_DIRS) {
      for (const name of SPEC_NAMES) {
        for (const ext of SPEC_EXTENSIONS) {
          const file = `${dir}${name}.${ext}`
          if (fs.exists(file) && looksLikeOpenApi(fs.read(file))) {
            found.push({ tool: 'spec', file, migrations: fromSpec(`./${file}`) })
          }
        }
      }
    }
  }
  return found
}

/** The tools that can be driven from flags alone, and the command that runs each. */
const CLI_TOOLS: ReadonlyArray<['orval' | 'hey-api', string]> = [
  ['orval', 'orval'],
  ['hey-api', 'openapi-ts'],
]

/**
 * The first script that runs `bin`, read as the config its flags spell. A
 * script naming a config FILE (`orval --config x.ts`, `openapi-ts --file
 * x.ts`) is read from that file instead.
 */
function fromScripts(
  fs: DetectFs,
  tool: 'orval' | 'hey-api',
  bin: string,
  scripts: Record<string, string>,
): Detected | undefined {
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') continue
    const args = commandArgs(command, bin)
    if (!args) continue
    const where = `package.json#scripts.${name}`
    const configFlag = tool === 'orval' ? ['-c', '--config'] : ['-f', '--file']
    const configFile = flagValue(args, configFlag)
    if (configFile !== undefined) {
      const rel = configFile.replace(/^\.\//, '')
      if (!fs.exists(rel)) continue
      const config = readExportedConfig(fs.read(rel))
      const migrations = config ? (tool === 'orval' ? fromOrval(config, rel) : fromHeyApi(config, rel)) : []
      return { tool, file: rel, migrations }
    }
    const config = tool === 'orval' ? orvalFlags(name, args) : heyApiFlags(args)
    return { tool, file: where, migrations: tool === 'orval' ? fromOrval(config, where) : fromHeyApi(config, where) }
  }
  return undefined
}

/**
 * The arguments after `bin` in a script command, up to the next `&&` / `;` /
 * `|`. `undefined` when the command does not run `bin`. Quotes group a value;
 * `npx orval`, `bunx @hey-api/openapi-ts` and `node_modules/.bin/orval` all
 * count.
 */
export function commandArgs(command: string, bin: string): string[] | undefined {
  const tokens: string[] = []
  for (const m of command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) tokens.push(m[1] ?? m[2] ?? (m[3] as string))
  const at = tokens.findIndex((t) => t === bin || t.endsWith(`/${bin}`))
  if (at === -1) return undefined
  const out: string[] = []
  for (const t of tokens.slice(at + 1)) {
    if (t === '&&' || t === ';' || t === '|' || t === '||') break
    // `--flag=value` reads as `--flag value`.
    const eq = /^(--?[\w-]+)=(.*)$/.exec(t)
    if (eq) out.push(eq[1] as string, (eq[2] as string).replace(/^(['"])(.*)\1$/, '$2'))
    else out.push(t)
  }
  return out
}

function flagValue(args: readonly string[], names: readonly string[]): string | undefined {
  const i = args.findIndex((a) => names.includes(a))
  const v = i === -1 ? undefined : args[i + 1]
  return v !== undefined && !v.startsWith('-') ? v : undefined
}

const str = (value: string): Lit => ({ kind: 'string', value })
const yes: Lit = { kind: 'boolean', value: true }

/**
 * orval's flags as the config object they are shorthand for, keyed by the
 * script name (orval's config is keyed by API). A flag with no config
 * counterpart lands under `output`, where the mapper reports it by name.
 */
function orvalFlags(scriptName: string, args: readonly string[]): Lit {
  let input: Lit | undefined
  const output: Array<[string, Lit]> = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const next = args[i + 1]
    const value = next !== undefined && !next.startsWith('-') ? next : undefined
    if (a === '-i' || a === '--input') {
      if (value !== undefined) input = str(value)
      i += value !== undefined ? 1 : 0
    } else if (a === '-o' || a === '--output') {
      if (value !== undefined) output.push(['target', str(value)])
      i += value !== undefined ? 1 : 0
    } else if (a === '--client' || a === '--mode') {
      if (value !== undefined) output.push([a.slice(2), str(value)])
      i += value !== undefined ? 1 : 0
    } else if (a === '--mock' || a === '--clean' || a === '--prettier' || a === '--biome') {
      output.push([a.slice(2), yes])
    } else if (a.startsWith('-')) {
      output.push([a.replace(/^-+/, ''), value !== undefined ? str(value) : yes])
      i += value !== undefined ? 1 : 0
    }
  }
  const project: Array<[string, Lit]> = []
  if (input) project.push(['input', input])
  if (output.length > 0) project.push(['output', { kind: 'object', entries: output }])
  return { kind: 'object', entries: [[scriptName, { kind: 'object', entries: project }]] }
}

/** `@hey-api/openapi-ts`'s flags as its config object. `-p` takes several values. */
function heyApiFlags(args: readonly string[]): Lit {
  const entries: Array<[string, Lit]> = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (!a.startsWith('-')) continue
    const values: string[] = []
    const many = a === '-p' || a === '--plugins'
    while (args[i + 1] !== undefined && !(args[i + 1] as string).startsWith('-')) {
      values.push(args[++i] as string)
      if (!many) break
    }
    const key =
      a === '-i' || a === '--input'
        ? 'input'
        : a === '-o' || a === '--output'
          ? 'output'
          : a === '-c' || a === '--client'
            ? 'client'
            : many
              ? 'plugins'
              : a.replace(/^-+/, '')
    const value: Lit = many
      ? { kind: 'array', items: values.map(str) }
      : values[0] !== undefined
        ? str(values[0])
        : yes
    entries.push([key, value])
  }
  return { kind: 'object', entries }
}

/** Cheap check that a file is an API description, not some other JSON/YAML. */
function looksLikeOpenApi(text: string): boolean {
  return /(^|[{,\s])["']?(openapi|swagger)["']?\s*:\s*["']?\d/.test(text.slice(0, 4096))
}

export interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function readPackageJson(fs: DetectFs): PackageJson | undefined {
  if (!fs.exists('package.json')) return undefined
  try {
    return JSON.parse(fs.read('package.json')) as PackageJson
  } catch {
    return undefined
  }
}
