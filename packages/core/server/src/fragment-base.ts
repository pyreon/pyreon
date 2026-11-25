/**
 * The route base server-island markers fetch their fragments under when no
 * router is around them (an islands-only page starts none). Its own module,
 * apart from `server-island.ts`, so a client that only needs to SET the base
 * (zero's islands-only runtime, on every page with an island) does not ship
 * the marker activation code with it: that loads only on a page that has a
 * server island.
 *
 * Module scope, not `globalThis`: trusted configuration must not live where
 * injected markup can shadow it (`<a id="…">` on Window), and only the
 * browser bundle — one instance — reads it.
 */
import { isRoutePath } from './route-path'

let configuredBase = ''

/**
 * Set the route base server-island markers fetch their fragments under when
 * no router is around them — an islands-only page starts none. `@pyreon/zero`
 * calls it with its build-time base. Must be a root-relative path (`/sub/`);
 * anything else is refused (dev warning) and leaves the base unset.
 */
export function setServerIslandBase(base: string): void {
  if (base === '' || base === '/' || isRoutePath(base)) {
    configuredBase = base
    return
  }
  if (process.env.NODE_ENV !== 'production') {
    // oxlint-disable-next-line no-console
    console.warn(`[Pyreon] setServerIslandBase: "${base}" is not a root-relative path such as "/sub/"; ignored.`)
  }
}

/** The base set with `setServerIslandBase` ('' when none was). */
export function configuredServerIslandBase(): string {
  return configuredBase
}

/** @internal Test isolation. */
export function _resetServerIslandBase(): void {
  configuredBase = ''
}
