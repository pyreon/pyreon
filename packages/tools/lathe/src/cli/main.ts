/**
 * The `lathe` bin's real entry.
 *
 * Kept separate from `run.ts` so the pure half stays testable, and so the bin
 * is the only place that touches `node:fs`, `process` or the config loader.
 */

import { CONFIG_FILENAMES, sectionFrom } from '@pyreon/config'
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LatheSection } from '../core/config'
import { pullSpec } from './pull'
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
  if (argv.command === 'pull') {
    // The URL is the positional; the DESTINATION is the configured input, so
    // `pull` and `generate` cannot disagree about which file is the spec.
    const url = argv.input
    if (!url || !/^https?:\/\//.test(url)) {
      process.stderr.write(
        '[Pyreon] lathe: `lathe pull` needs an http(s) URL — `lathe pull https://api.example.com/openapi.json`\n',
      )
      return 1
    }
    const { resolveProjects } = await import('../core/config')
    const dest = resolveProjects(section)[0]?.input
    if (!dest) {
      process.stderr.write(
        '[Pyreon] lathe: no `input` configured, so there is nowhere to put the spec.\n' +
          '  Set `lathe.input` in pyreon.config.ts, or pass `--out-spec <path>`.\n',
      )
      return 1
    }
    return pullSpec(url, abs(dest))
  }
  const scoped: Fs = {
    ...realFs,
    read: (p) => realFs.read(abs(p)),
    write: (p, c) => realFs.write(abs(p), c),
    exists: (p) => realFs.exists(abs(p)),
    mkdirp: (p) => realFs.mkdirp(abs(p)),
  }
  const once = async (): Promise<number> => {
    const { code, stdout } = await run(argv, section, scoped)
    process.stdout.write(stdout)
    return code
  }
  const code = await once()
  if (!argv.watch || argv.command !== 'generate') return code

  // Watch the SPECS, not the output: regenerating on our own writes would
  // loop. Editors write via rename as often as they write in place, so the
  // watcher is on the containing directory with a filename filter rather than
  // on the file itself -- a watch on the inode dies the first time an editor
  // replaces it.
  const specs = await specPaths(section, argv, cwd)
  if (specs.length === 0) return code
  process.stdout.write(`\nwatching ${specs.length} spec(s) - ctrl-c to stop\n`)

  let queued: ReturnType<typeof setTimeout> | undefined
  const rerun = (): void => {
    // Coalesce: a single save commonly produces several events (write, rename,
    // attribute change), and regenerating once per event is visible churn.
    if (queued) clearTimeout(queued)
    queued = setTimeout(() => {
      queued = undefined
      void once().catch((err: unknown) => {
        // A watch loop must SURVIVE a bad edit. A spec mid-save is routinely
        // unparseable, and exiting there would make the mode useless exactly
        // when it is most wanted.
        process.stdout.write(`${(err as Error).message}\n`)
      })
    }, 60)
  }

  for (const spec of specs) {
    const dir = dirname(spec)
    const base = basename(spec)
    watch(dir, (_event, changed) => {
      if (changed === null || changed === base) rerun()
    })
  }
  // Never resolves: the process lives until the user stops it.
  await new Promise<never>(() => {})
  return code
}

/** Absolute paths of every spec this config reads. */
async function specPaths(
  section: LatheSection | undefined,
  argv: ReturnType<typeof parseArgv>,
  cwd: string,
): Promise<string[]> {
  const { resolveProjects } = await import('../core/config')
  const merged: LatheSection = { ...section, ...(argv.input ? { input: argv.input } : {}) }
  try {
    return resolveProjects(merged)
      .map((p) => (isAbsolute(p.input) ? p.input : resolve(cwd, p.input)))
      .filter((p) => existsSync(p))
  } catch {
    return []
  }
}
