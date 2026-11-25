import { routeBaseOf } from './config'

/**
 * Make `config.base` the ROUTE base (see {@link routeBaseOf}) once Vite has
 * resolved its own. Each zero plugin calls this from its `configResolved`, so
 * `config.base` is never a stale pre-resolution value; asset URLs read Vite's
 * resolved base directly, never `config.base`.
 *
 * @returns whether `config.base` changed.
 * @internal — used by zero's own plugins. Lives outside `config.ts` because
 * that file is the public `@pyreon/zero/config` entry.
 */
export function adoptRouteBase(
  config: { base: string },
  zeroBase: string | undefined,
  assetBase: string | undefined,
): boolean {
  const route = routeBaseOf(zeroBase, assetBase)
  if (route === config.base) return false
  config.base = route

  return true
}
