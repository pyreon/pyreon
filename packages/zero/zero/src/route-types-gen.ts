/**
 * Typed-routes codegen wiring (server-only). Scans the routes, emits the
 * `RegisteredRoutes` augmentation (via `generateRouteTypes`), and writes it to
 * `src/pyreon-routes.d.ts` — auto-included by the app's `tsconfig` `include`.
 *
 * Split out of `vite-plugin.ts` so the page-filtering + write-if-changed logic
 * is unit-testable without importing the heavy plugin module.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { scanRouteFilesWithExports } from './fs-router'
import { generateRouteTypes } from './route-types'
import type { FileRoute, RenderMode } from './types'

/**
 * Collect the URL paths of PAGE routes only — layouts, error / loading
 * boundaries, and 404 files have no navigable path and are excluded.
 */
export function collectRoutePaths(routes: readonly FileRoute[]): string[] {
  return routes
    .filter((r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound)
    .map((r) => r.urlPath)
}

/**
 * Generate `src/pyreon-routes.d.ts` for the routes under `routesDir`. Writes
 * only on a content change (no HMR churn). All fs / scan errors are swallowed —
 * typed routes never break the build. Returns whether a write happened (for
 * tests / logging).
 */
export async function writeRouteTypes(
  routesDir: string,
  root: string,
  mode: RenderMode,
): Promise<boolean> {
  let paths: string[]
  try {
    const routes = await scanRouteFilesWithExports(routesDir, mode)
    paths = collectRoutePaths(routes)
  } catch {
    return false // routes dir missing / scan error — skip
  }
  const dts = generateRouteTypes(paths)
  const out = `${root}/src/pyreon-routes.d.ts`
  // Read-then-compare (no `existsSync` check-before-use — a missing file is
  // just a read miss, so the try/catch handles it; this also avoids a
  // time-of-check-to-time-of-use race on the `.d.ts`).
  let previous: string | null = null
  try {
    previous = readFileSync(out, 'utf-8')
  } catch {
    /* missing / unreadable — fall through to write */
  }
  if (previous === dts) return false
  try {
    writeFileSync(out, dts)
    return true
  } catch {
    return false // read-only fs, etc.
  }
}
