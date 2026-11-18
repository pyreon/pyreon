import { type Dirent, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { detectRouteExports, everyPageIslandsOnly, scanRouteFilesWithExports } from './fs-router'
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
 * file exports `hydrate` and no `routeRules` entry declares it (so no page
 * can be marked), `true` otherwise.
 *
 * `__ZERO_APP_PAGES__` — `false` when EVERY page is islands-only
 * (`everyPageIslandsOnly`): no page ever starts the app, so
 * `startClientLazy` compiles its app path (the dynamic import of zero's app
 * client, and with it the router) out of the client build. Kept, the router
 * stayed alive in the build, and an island that imports anything from
 * `@pyreon/router` (a `<RouterLink>` in a kit component) shared a chunk with
 * all of it. `true` on any doubt.
 */
export function clientFlagsPlugin(userConfig: ZeroConfig, appMode: string): Plugin {
  return {
    name: 'pyreon-zero:client-flags',
    async config(viteConfig, env) {
      if (env.command !== 'build') return
      const root = resolve(viteConfig.root ?? process.cwd())
      const routesDir = join(root, 'src', 'routes')
      const hydrate = !isSpaEverywhere(userConfig, appMode, routesDir)
      const islandsOnly = rulesDeclareHydrate(userConfig) || mayDeclareIslandsOnly(routesDir)

      return {
        ...(islandsOnly && !env.isSsrBuild ? { build: islandsRuntimeChunk() } : {}),
        define: {
          __ZERO_HYDRATE__: JSON.stringify(hydrate),
          __ZERO_ISLANDS_ONLY__: JSON.stringify(islandsOnly),
          __ZERO_APP_PAGES__: JSON.stringify(!(islandsOnly && (await allPagesIslandsOnly(userConfig, appMode, routesDir)))),
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

/** True when a `routeRules` entry declares `hydrate` (#4371): it can mark pages too. */
export function rulesDeclareHydrate(userConfig: ZeroConfig): boolean {
  return Object.values(userConfig.routeRules ?? {}).some((rule) => rule?.hydrate !== undefined)
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

/**
 * True when every page under `routesDir` is islands-only, read with the same
 * scan and resolver the route generator uses. Every doubt (no routes, a scan
 * error) answers `false`: a wrong `true` would drop the app a page needs.
 */
export async function allPagesIslandsOnly(
  userConfig: ZeroConfig,
  appMode: string,
  routesDir: string,
): Promise<boolean> {
  try {
    const routes = await scanRouteFilesWithExports(routesDir, appMode as never)

    return everyPageIslandsOnly(routes, userConfig.routeRules)
  } catch {
    return false
  }
}

/**
 * The client build of an app with islands-only pages (#4371) puts
 * `@pyreon/server/client` (the islands runtime `client-islands` imports, and
 * `island()`) and `client-islands` itself in ONE chunk. Without it the bundler splits the runtime into
 * a dozen tiny chunks shared between the runtime and the island components,
 * and every islands-only page requested all of them: measured on pyreon.dev,
 * 36 files and 55,843 B gzip on the home page against 21 files and 51,100 B
 * with the group (the site carried this group in its own config before).
 * Vite merges it with an app's own `codeSplitting.groups`.
 */
interface ChunkGroup {
  name: string
  priority: number
  test?: RegExp
  tags?: '$initial'[]
}

export function islandsRuntimeChunk(): { rolldownOptions: { output: { codeSplitting: { groups: ChunkGroup[] } } } } {
  return {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // What the entry itself needs stays out of the islands chunk, so a
            // page with no island still loads only the entry.
            { name: 'entry-deps', tags: ['$initial'], priority: 2 },
            {
              name: 'islands-runtime',
              priority: 1,
              // `@pyreon/server/client`, and zero's own `client-islands` (its
              // source, or its lib chunk) so it is not a request of its own.
              test: /[\\/](?:core|@pyreon)[\\/]server[\\/](?:src|lib)[\\/]|[\\/]client-islands(?:-[\w-]+)?\.[cm]?[jt]s$/,
            },
          ],
        },
      },
    },
  }
}
