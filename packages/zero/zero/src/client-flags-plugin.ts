import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
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
 */
export function clientFlagsPlugin(userConfig: ZeroConfig, appMode: string): Plugin {
  return {
    name: 'pyreon-zero:client-flags',
    config(viteConfig, env) {
      if (env.command !== 'build') return
      const root = resolve(viteConfig.root ?? process.cwd())
      const hydrate = !isSpaEverywhere(userConfig, appMode, join(root, 'src', 'routes'))
      return { define: { __ZERO_HYDRATE__: JSON.stringify(hydrate) } }
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
  if (!existsSync(routesDir)) return true
  const stack = [routesDir]
  try {
    while (stack.length > 0) {
      const dir = stack.pop()!
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) stack.push(full)
        else if (/\.[mc]?[jt]sx?$/.test(entry) && readFileSync(full, 'utf-8').includes('renderMode')) {
          return false
        }
      }
    }
  } catch {
    return false
  }
  return true
}
