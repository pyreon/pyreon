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
import { readExportedConfig } from './literal'

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
