/**
 * Filesystem discovery — walk a project's source, scan each file with
 * `scanSource`, and produce the catalog. This is the "point Atlas at your
 * components" entry (dev/build-time; Node only).
 */
import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { ComponentIntelligence } from '../core'
import type { AtlasPlugin } from '../plugins'
import { defineAtlasPlugin } from '../plugins'
import { scanSource } from './scan'

export interface DiscoverOptions {
  /** project root (default '.') */
  cwd?: string
  /** directory to scan, relative to cwd (default 'src') */
  dir?: string
  /** file extensions to scan (default ['.tsx']) */
  extensions?: readonly string[]
  /** path substrings to skip (default node_modules + test/spec/stories files) */
  ignore?: readonly string[]
}

const DEFAULT_IGNORE = ['node_modules', '.test.', '.spec.', '.stories.', '.d.ts']

function walk(dir: string, exts: readonly string[], ignore: readonly string[], acc: string[]): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as unknown as Dirent[]
  } catch {
    return // unreadable / missing directory
  }
  for (const entry of entries) {
    const name = String(entry.name)
    const full = join(dir, name)
    if (ignore.some((p) => full.includes(p))) continue
    if (entry.isDirectory()) walk(full, exts, ignore, acc)
    else if (exts.includes(extname(name))) acc.push(full)
  }
}

/** Discover every exported component under a project directory. */
export function discoverComponents(options: DiscoverOptions = {}): ComponentIntelligence[] {
  const cwd = options.cwd ?? '.'
  const root = join(cwd, options.dir ?? 'src')
  const exts = options.extensions ?? ['.tsx']
  const ignore = options.ignore ?? DEFAULT_IGNORE

  const files: string[] = []
  walk(root, exts, ignore, files)
  files.sort() // deterministic order

  const out: ComponentIntelligence[] = []
  const seen = new Set<string>()
  for (const file of files) {
    let code: string
    try {
      code = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const comp of scanSource(code, file)) {
      if (seen.has(comp.name)) continue // first occurrence of a name wins
      seen.add(comp.name)
      out.push(comp)
    }
  }
  return out
}

/** A discovery plugin that scans the project's source for components. */
export function fileDiscoveryPlugin(options: DiscoverOptions = {}): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:file-discovery',
    discover: (ctx) => discoverComponents({ cwd: options.cwd ?? ctx.cwd, ...stripCwd(options) }),
  })
}

/** options without cwd (so the plugin's ctx.cwd default isn't overridden by undefined). */
function stripCwd(options: DiscoverOptions): Omit<DiscoverOptions, 'cwd'> {
  const { cwd: _cwd, ...rest } = options
  return rest
}
