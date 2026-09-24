/**
 * Build-time server-action manifest (server-only).
 *
 * `defineAction` registers an action when its defining module EVALUATES, and
 * zero loads route modules lazily — so on a fresh server every action
 * answered "Action not found" until some render happened to load its module
 * (navigating client-side straight to a page with an action broke). The
 * manifest gives the server every action id up front, mapped to a lazy
 * loader for the module that defines it; `_resolveAction` loads it on
 * demand.
 *
 * Ids come from `collectActionIds` — the SAME derivation the action
 * transform bakes into both bundles — so a manifest id always matches.
 *
 * @internal
 */
import type { Dirent } from 'node:fs'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { collectActionIds } from './actions-transform'

const SOURCE_RE = /\.[mc]?[jt]sx?$/
const SKIP_FILE_RE = /\.(?:test|spec|stories)\.[mc]?[jt]sx?$|\.d\.[mc]?ts$/
const SKIP_DIRS = new Set(['node_modules', 'tests', '__tests__', 'dist', 'lib'])

/** Every `defineAction` id under `<root>/src`, mapped to its module's absolute path. */
export function scanActionModules(root: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
        continue
      }
      if (!entry.isFile() || !SOURCE_RE.test(entry.name) || SKIP_FILE_RE.test(entry.name)) continue
      let code: string
      try {
        code = readFileSync(full, 'utf-8')
      } catch {
        continue
      }
      const rel = relative(root, full).split(sep).join('/')
      for (const id of collectActionIds(code, full, rel)) out.set(id, full)
    }
  }
  walk(join(root, 'src'))
  return out
}

/**
 * Does a source text possibly define server actions? The cheap gate the dev
 * watcher applies before re-scanning a changed file — the same substring the
 * transform checks before parsing.
 */
export function mayDefineActions(code: string): boolean {
  return code.includes('@pyreon/zero/actions') && code.includes('defineAction')
}

/** Source extensions the manifest scans (and the dev watcher reacts to). */
export function isActionSourceFile(file: string): boolean {
  return SOURCE_RE.test(file) && !SKIP_FILE_RE.test(file)
}

/**
 * Module source that registers the manifest — appended to the generated
 * `virtual:zero/route-middleware`, which every zero server entry and the
 * dev pipeline import — plus the set of files it maps (the dev watcher's
 * "is this file in the manifest?" answer). Empty `code` when the app
 * defines no actions.
 */
export function generateActionManifest(root: string): { code: string; files: Set<string> } {
  const modules = scanActionModules(root)
  const files = new Set(modules.values())
  if (modules.size === 0) return { code: '', files }
  const entries = [...modules]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, file]) => `  ${JSON.stringify(id)}: () => import(${JSON.stringify(file)})`)
  const code = [
    `import { _registerActionModules } from "@pyreon/zero/actions"`,
    `_registerActionModules({`,
    entries.join(',\n'),
    `})`,
  ].join('\n')
  return { code, files }
}
