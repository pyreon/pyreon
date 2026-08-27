/**
 * The `lathe` bin's real entry.
 *
 * Kept separate from `run.ts` so the pure half stays testable, and so the bin
 * is the only place that touches `node:fs`, `process` or the config loader.
 */

import { CONFIG_FILENAMES, sectionFrom } from '@pyreon/config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LatheSection } from '../core/config'
import { parseArgv, run, type Fs } from './run'

const realFs: Fs = {
  read: (p) => readFileSync(p, 'utf8'),
  write: (p, c) => writeFileSync(p, c, 'utf8'),
  exists: (p) => existsSync(p),
  mkdirp: (p) => mkdirSync(p, { recursive: true }),
  join: (...parts) => join(...parts),
}

/** Read the `lathe` section from `pyreon.config.*`, when one exists. */
async function loadSection(cwd: string): Promise<LatheSection | undefined> {
  for (const name of CONFIG_FILENAMES) {
    const full = resolve(cwd, name)
    if (!existsSync(full)) continue
    try {
      const mod = (await import(pathToFileURL(full).href)) as Record<string, unknown>
      // `sectionFrom` accepts the default export or a named one, matching every
      // other Pyreon config loader. Re-deriving that here is how two tools end
      // up disagreeing about which export shape is valid.
      return sectionFrom(mod, 'lathe') as LatheSection | undefined
    } catch (err) {
      // A config that exists but cannot be loaded is an ERROR, never a silent
      // fall-through to defaults: the user wrote it expecting it to be read.
      throw new Error(`[Pyreon] lathe: failed to load ${name}: ${(err as Error).message}`)
    }
  }
  return undefined
}

export async function main(argvRaw: readonly string[], cwd: string): Promise<number> {
  const argv = parseArgv(argvRaw)
  const section = await loadSection(cwd)
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p))
  const scoped: Fs = {
    ...realFs,
    read: (p) => realFs.read(abs(p)),
    write: (p, c) => realFs.write(abs(p), c),
    exists: (p) => realFs.exists(abs(p)),
    mkdirp: (p) => realFs.mkdirp(abs(p)),
  }
  const { code, stdout } = await run(argv, section, scoped)
  process.stdout.write(stdout)
  return code
}
