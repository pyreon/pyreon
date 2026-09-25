/**
 * Finding and reading `pyreon.config.*`, shared by the CLI and the Vite plugin.
 *
 * One implementation so the two cannot disagree about which file is the
 * config or what its relative paths mean -- the plugin used to ignore the
 * config entirely, so a project configured for the CLI generated nothing in
 * `vite dev` unless the options were duplicated into `vite.config.ts`.
 */

import { CONFIG_FILENAMES, sectionFrom } from '@pyreon/config'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LatheSection } from '../core/config'

/** A loaded config: the section, and the file it came from. */
export interface LoadedConfig {
  section: LatheSection | undefined
  /** Absolute path of the config file, or `undefined` when none was found. */
  file: string | undefined
}

/**
 * Find the config file: `--config` when given, else the nearest
 * `pyreon.config.*` walking UP from `cwd`, stopping at the repository root.
 *
 * Only the working directory used to be checked, so running `lathe` from
 * `src/` silently generated with no config at all -- defaults, a different
 * output directory, and no error.
 */
export function findConfigFile(cwd: string, explicit?: string | undefined): string | undefined {
  if (explicit) {
    const full = isAbsolute(explicit) ? explicit : resolve(cwd, explicit)
    if (!existsSync(full)) throw new Error(`[Pyreon] lathe: --config ${explicit} does not exist.`)
    return full
  }
  let dir = resolve(cwd)
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const full = join(dir, name)
      if (existsSync(full)) return full
    }
    // The repository root bounds the search: a config ABOVE the checkout
    // belongs to some other project.
    if (existsSync(join(dir, '.git'))) return undefined
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Read the `lathe` section, with its paths made relative to `cwd`.
 *
 * The config documents its paths as relative to the config FILE, and that is
 * now what they are: they used to resolve against the working directory, so
 * the same config wrote to a different place depending on where the command
 * was typed. Rebased to cwd-relative (not absolute) so the report stays short.
 *
 * `bust` appends a query to the import URL so a watcher re-reads an edited
 * config instead of the module cache's copy.
 */
export async function loadConfig(
  cwd: string,
  explicit?: string | undefined,
  bust?: string | undefined,
): Promise<LoadedConfig> {
  const file = findConfigFile(cwd, explicit)
  if (!file) return { section: undefined, file: undefined }
  let mod: Record<string, unknown>
  try {
    const url = pathToFileURL(file).href + (bust ? `?t=${bust}` : '')
    mod = (await import(url)) as Record<string, unknown>
  } catch (err) {
    // A config that exists but cannot be loaded is an ERROR, never a silent
    // fall-through to defaults: the user wrote it expecting it to be read.
    throw new Error(`[Pyreon] lathe: failed to load ${relative(cwd, file) || file}: ${(err as Error).message}`, {
      cause: err,
    })
  }
  // `sectionFrom` accepts the default export or a named one, matching every
  // other Pyreon config loader. Re-deriving that here is how two tools end up
  // disagreeing about which export shape is valid.
  const section = sectionFrom(mod, 'lathe') as LatheSection | undefined
  return { section: section && rebase(section, dirname(file), cwd), file }
}

/** Make a section's relative paths relative to `cwd` instead of `from`. */
export function rebase(section: LatheSection, from: string, cwd: string): LatheSection {
  const fix = (p: string | undefined): string | undefined => {
    if (p === undefined || isAbsolute(p)) return p
    const rel = relative(cwd, resolve(from, p))
    return rel === '' ? '.' : rel
  }
  const out: LatheSection = { ...section }
  const input = fix(section.input)
  const output = fix(section.output)
  if (input !== undefined) out.input = input
  if (output !== undefined) out.output = output
  if (section.projects) {
    out.projects = section.projects.map((p) => {
      const q = { ...p, input: fix(p.input) ?? p.input }
      const o = fix(p.output)
      return o === undefined ? q : { ...q, output: o }
    })
  }
  return out
}
