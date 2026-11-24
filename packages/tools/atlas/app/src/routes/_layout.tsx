import { lazy } from '@pyreon/core'

/**
 * Every workbench page is the client shell: the workbench mounts arbitrary
 * project components, many of which need a browser, so it is never
 * server-rendered. Under `mode: 'ssg'` a `spa` route gets the CSR shell written
 * at its path — which is what makes `/<component>/` a real page on a plain file
 * server.
 */
export const renderMode = 'spa'

/**
 * The workbench is loaded lazily so evaluating the route tree (the SSG pass
 * does, to partition paths by mode) never evaluates the catalog — and through
 * it the project's components — in Node. The SSR build never reaches it at all.
 */
const Shell = import.meta.env.SSR ? () => null : lazy(() => import('../shell'))

/**
 * ONE layout owns the workbench; the leaf routes (`/` and `/:component`)
 * render nothing. Moving between components is a navigation between leaves of
 * this layout, so the workbench — and every edit in it — stays mounted. The
 * workbench reads and writes its own URL state (`?c=`, `/<component>/`).
 */
export function layout() {
  return (
    <div id="atlas-root">
      <Shell />
    </div>
  )
}
