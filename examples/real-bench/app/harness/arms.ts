/**
 * The arms: one directory per framework under `arms/<id>/`, each with its own
 * `package.json` (exact versions), `package-lock.json` and `arm.json`.
 * They sit outside the bun workspace (the root workspace globs reach
 * `examples/*`, not `examples/real-bench/app/arms/*`), so a normal
 * `bun install` downloads none of their dependencies.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** `examples/real-bench/app` */
export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ARMS = join(APP_ROOT, 'arms')
export const SHARED = join(APP_ROOT, 'shared')

export interface ArmManifest {
  id: string
  label: string
  /** The framework docs pages the arm's code follows. */
  docs: string[]
  /** Packages whose installed versions every result records. */
  packages: string[]
  /** One line each: the router and the state approach, as CONTRACT.md's table names them. */
  router: string
  state: string
  /** How the production build splits code. "none" = one entry chunk; otherwise what the framework does by itself. */
  codeSplitting: string
  /** Build command, run in the arm directory with NODE_ENV=production. */
  build: string[]
  /** Build output directory, relative to the arm. */
  outDir: string
  /** The SPA fallback page inside `outDir`, served for every path without a file extension. */
  fallback: string
  /** Verbatim copies of `shared/data.ts` and `shared/app.css`, relative to the arm. */
  dataFile: string
  cssFile: string
  notes: string[]
}

export interface Arm {
  dir: string
  m: ArmManifest
}

/** Every arm, in a fixed order (alphabetical by id), or just the ids asked for. */
export function loadArms(ids: readonly string[] = []): Arm[] {
  const all = readdirSync(ARMS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ARMS, d.name, 'arm.json')))
    .map((d) => {
      const dir = join(ARMS, d.name)
      const m = JSON.parse(readFileSync(join(dir, 'arm.json'), 'utf8')) as ArmManifest
      if (m.id !== d.name)
        throw new Error(`[real-bench/app] arms/${d.name}/arm.json has id "${m.id}"`)
      return { dir, m }
    })
    .sort((a, b) => a.m.id.localeCompare(b.m.id))
  if (ids.length === 0) return all
  const unknown = ids.filter((id) => !all.some((a) => a.m.id === id))
  if (unknown.length > 0) {
    throw new Error(
      `[real-bench/app] unknown arm(s): ${unknown.join(', ')} (have: ${all.map((a) => a.m.id).join(', ')})`,
    )
  }
  return all.filter((a) => ids.includes(a.m.id))
}

/** Throws when the arm's copy of a shared file is not byte-identical to `shared/`. */
export function assertSharedIdentical({ dir, m }: Arm): void {
  for (const [rel, name] of [
    [m.dataFile, 'data.ts'],
    [m.cssFile, 'app.css'],
  ] as const) {
    const copy = join(dir, rel)
    const want = readFileSync(join(SHARED, name), 'utf8')
    if (!existsSync(copy) || readFileSync(copy, 'utf8') !== want) {
      throw new Error(
        `[real-bench/app] ${m.id}: ${rel} is not a verbatim copy of shared/${name}. ` +
          'Run `bun setup.ts --copy-shared` from examples/real-bench/app.',
      )
    }
  }
}

/** Installed version of each package the manifest lists, read from the arm's own node_modules (or the workspace's). */
export function installedVersions({ dir, m }: Arm): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of m.packages) {
    let at = dir
    let version = 'NOT INSTALLED'
    // Walk up like Node's resolver: the pyreon arm in workspace mode resolves from the repo root.
    for (;;) {
      const file = join(at, 'node_modules', name, 'package.json')
      if (existsSync(file)) {
        version = (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version
        break
      }
      const up = dirname(at)
      if (up === at) break
      at = up
    }
    out[name] = version
  }
  return out
}

export function outDir({ dir, m }: Arm): string {
  return join(dir, m.outDir)
}
