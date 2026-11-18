/**
 * Which directories under the project root hold BUILD OUTPUT, so the boot-time
 * prescans (signal exports, `island()` declarations) never read a bundle as
 * source.
 *
 * A bundle contains the same `island(() => import(…), { name })` calls and
 * `export const x = signal(…)` declarations as the source it came from. Read
 * as source, a server bundle's islands land in the CLIENT islands registry.
 * The walker used to know output only by name (`dist` at a package root, any
 * dot-dir), so `build.outDir: 'dist-ssr'` or any custom out dir was scanned.
 *
 * Two sources, because one build cannot see the other's config:
 *
 * 1. What THIS config says is output: `build.outDir` and every environment's
 *    `build.outDir` (the SSR one included), `publicDir` (copied verbatim, never
 *    compiled) and `cacheDir`.
 * 2. What earlier builds of this project WROTE: every Pyreon build records its
 *    output directory in `<cacheDir>/pyreon-build-outputs.json` at
 *    `writeBundle`. A client build with `outDir: 'dist'` thereby skips the
 *    `dist-ssr` an earlier `vite build --ssr --outDir dist-ssr` left behind.
 *    Entries whose directory no longer exists are dropped on every read, so
 *    the record holds at most the output directories present on disk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const RECORD_FILE = 'pyreon-build-outputs.json'

/** The slice of Vite's `ResolvedConfig` this module reads. */
export interface OutputConfig {
  root: string
  cacheDir: string
  publicDir: string
  build: { outDir: string }
  environments?: Record<string, { build?: { outDir?: string } }>
}

/** Absolute output directories this resolved config declares. */
export function configuredOutputDirs(config: OutputConfig): string[] {
  const dirs = new Set<string>()
  const add = (dir: string | undefined) => {
    if (dir) dirs.add(resolve(config.root, dir))
  }
  add(config.build.outDir)
  for (const env of Object.values(config.environments ?? {})) add(env.build?.outDir)
  add(config.publicDir)
  add(config.cacheDir)

  return [...dirs]
}

/** Output directories earlier builds of this project wrote (still on disk). */
export function recordedOutputDirs(cacheDir: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cacheDir, RECORD_FILE), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((d): d is string => typeof d === 'string' && existsSync(d))
  } catch {
    return [] // no record yet, or unreadable — the config's own dirs still apply
  }
}

/** Record that a build wrote to `outDir`. Best-effort: a failure only loses the record. */
export function recordOutputDir(cacheDir: string, outDir: string): void {
  try {
    const dirs = new Set(recordedOutputDirs(cacheDir))
    const abs = resolve(outDir)
    if (dirs.has(abs)) return
    dirs.add(abs)
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(join(cacheDir, RECORD_FILE), JSON.stringify([...dirs].sort(), null, 2), 'utf-8')
  } catch {
    /* read-only cache dir — the config-declared dirs still apply */
  }
}

/**
 * The output directories the walker must skip: those strictly INSIDE `root`,
 * as paths relative to it (the walker's own root may be a symlinked spelling
 * of the same directory).
 * An out dir equal to or above the root would hide the whole tree; Vite
 * already warns about that layout, and skipping everything would silently
 * empty both registries.
 */
export function outputDirsToSkip(root: string, dirs: readonly string[]): Set<string> {
  const absRoot = resolve(root)
  const skip = new Set<string>()
  for (const dir of dirs) {
    const abs = resolve(dir)
    const rel = relative(absRoot, abs)
    const outside = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
    if (rel !== '' && !outside) skip.add(rel)
  }

  return skip
}

/** The directory a Rollup/Rolldown output writes into. */
export function outputDirOf(output: { dir?: string | undefined; file?: string | undefined }): string | undefined {
  if (output.dir) return output.dir
  if (output.file) return dirname(output.file)
  return undefined
}
