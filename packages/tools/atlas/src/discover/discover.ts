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
import { discoverRocketstyle, type RocketstyleDiscoveryOptions } from './rocketstyle'
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

/** Every source file discovery would scan, in deterministic order. */
export function listComponentFiles(options: DiscoverOptions = {}): string[] {
  const root = join(options.cwd ?? '.', options.dir ?? 'src')
  const files: string[] = []
  walk(root, options.extensions ?? ['.tsx'], options.ignore ?? DEFAULT_IGNORE, files)
  return files.sort() // deterministic order
}

/** Discover every exported component under a project directory. */
export function discoverComponents(options: DiscoverOptions = {}): ComponentIntelligence[] {
  const files = listComponentFiles(options)

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

/**
 * A discovery plugin that scans the project's source for components.
 *
 * With a `rocketstyle` loader it ALSO loads each file and emits the rocketstyle
 * components the static scan structurally cannot see. Both halves live in ONE
 * plugin so the "first occurrence of a name wins" rule has a single owner —
 * across two plugins the pipeline would happily emit the same component twice.
 */
export function fileDiscoveryPlugin(
  options: DiscoverOptions & { rocketstyle?: RocketstyleDiscoveryOptions } = {},
): AtlasPlugin {
  const { rocketstyle, ...discoverOptions } = options
  return defineAtlasPlugin({
    name: 'atlas:file-discovery',
    async discover(ctx) {
      const resolved = { cwd: discoverOptions.cwd ?? ctx.cwd, ...stripCwd(discoverOptions) }
      const scanned = discoverComponents(resolved)
      if (!rocketstyle) return scanned
      const extra = await discoverRocketstyle(
        listComponentFiles(resolved),
        rocketstyle,
        new Set(scanned.map((c) => c.name)),
      )
      return [...scanned, ...extra]
    },
  })
}

/** options without cwd (so the plugin's ctx.cwd default isn't overridden by undefined). */
function stripCwd(options: DiscoverOptions): Omit<DiscoverOptions, 'cwd'> {
  const { cwd: _cwd, ...rest } = options
  return rest
}
