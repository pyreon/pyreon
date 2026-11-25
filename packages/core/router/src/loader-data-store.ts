import type { ResolvedRoute, RouteRecord, RouterInstance } from './types'

/**
 * Store a loader result together with the loader key it was loaded FOR.
 *
 * A navigation writes the next page's data before the route switches (and,
 * under a View Transition, the switch waits for the transition callback). A
 * reader keyed only on "the record at this depth" would see that data on the
 * page still on screen. RouterView's data cell accepts a stored value only when
 * its key matches the key of the route it is showing (#4814).
 */
export function setLoaderData(
  router: RouterInstance,
  record: RouteRecord,
  route: Pick<ResolvedRoute, 'params' | 'query'>,
  value: unknown,
): void {
  router._loaderData.set(record, value)
  router._loaderDataKeys.set(record, router._loaderKeyOf(record, route))
}
