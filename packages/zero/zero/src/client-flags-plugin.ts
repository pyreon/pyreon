import { type Dirent, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { detectRouteExports } from './fs-router'
import type { ZeroConfig } from './types'

/**
 * Build-time flags for zero's CLIENT entry.
 *
 * `__ZERO_HYDRATE__` — `false` compiles hydration out of the client bundle.
 * `startClient` picks `hydrateRoot` or `mount` at runtime, so both were always
 * bundled; in an app that is SPA everywhere no page ever carries server HTML,
 * and the hydration machinery (~23 KB raw / ~7 KB gz, measured on kanban) was
 * pure weight. Defined `false` only when that is provably true, `true`
 * otherwise, and never in dev, so nothing changes while developing.
 *
 * `__ZERO_ISLANDS_ONLY__` — `false` compiles the islands-only page support
 * (#4371) out of `startClient`: the marker check that hands an islands-only
 * page to the islands runtime, and the navigation guard that turns a
 * navigation to one into a full page load. Defined `false` only when no route
 * file exports `hydrate` (so no page can be marked), `true` otherwise.
 */
export function clientFlagsPlugin(userConfig: ZeroConfig, appMode: string): Plugin {
  return {
    name: 'pyreon-zero:client-flags',
    config(viteConfig, env) {
      if (env.command !== 'build') return
      const root = resolve(viteConfig.root ?? process.cwd())
      const routesDir = join(root, 'src', 'routes')
      const hydrate = !isSpaEverywhere(userConfig, appMode, routesDir)

      return {
        define: {
          __ZERO_HYDRATE__: JSON.stringify(hydrate),
          __ZERO_ISLANDS_ONLY__: JSON.stringify(mayDeclareIslandsOnly(routesDir)),
        },
      }
    },
  }
}

/**
 * True only when no page can be server-rendered: the app mode is `spa`, no
 * `routeRules` entry declares another mode, and no route file mentions
 * `renderMode` at all. Every doubt answers `false` (keep hydration) — a wrong
 * `true` would drop the code a server-rendered page needs, a wrong `false`
 * costs only bytes.
 */
export function isSpaEverywhere(userConfig: ZeroConfig, appMode: string, routesDir: string): boolean {
  if (appMode !== 'spa') return false
  for (const rule of Object.values(userConfig.routeRules ?? {})) {
    const mode = (rule as { renderMode?: string }).renderMode
    if (mode !== undefined && mode !== 'spa') return false
  }
  // Walk with `withFileTypes` rather than `existsSync` + `statSync` before
  // each read: the entry type comes from the same `readdir` call, so there
  // is no separate check that the file could change after (CodeQL
  // js/file-system-race), and a missing routes dir is simply ENOENT.
  const stack = [routesDir]
  try {
    while (stack.length > 0) {
      const dir = stack.pop()!
      let entries: Dirent[]
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        // No routes directory at all: nothing can declare a render mode.
        if (dir === routesDir && (err as NodeJS.ErrnoException).code === 'ENOENT') return true
        throw err
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) stack.push(full)
        // A symlink's target is unknown without a second stat — keep hydration.
        else if (entry.isSymbolicLink()) return false
        else if (/\.[mc]?[jt]sx?$/.test(entry.name) && readFileSync(full, 'utf-8').includes('renderMode')) {
          return false
        }
      }
    }
  } catch {
    return false
  }

  return true
}

/**
 * True when any route file under `routesDir` exports `hydrate` (#4371), read
 * with the SAME detector the route generator uses, so a page the server can
 * mark is a page this answers `true` for. Every doubt (a symlink, an
 * unreadable tree) answers `true`: a wrong `false` would drop the code an
 * islands-only page needs, a wrong `true` costs only bytes.
 */
export function mayDeclareIslandsOnly(routesDir: string): boolean {
  const stack = [routesDir]
  try {
    while (stack.length > 0) {
      const dir = stack.pop()!
      let entries: Dirent[]
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        if (dir === routesDir && (err as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw err
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) stack.push(full)
        else if (entry.isSymbolicLink()) return true
        else if (/\.[mc]?[jt]sx?$/.test(entry.name)) {
          const source = readFileSync(full, 'utf-8')
          if (source.includes('hydrate') && detectRouteExports(source, entry.name).hasHydrate) return true
        }
      }
    }
  } catch {
    return true
  }

  return false
}
