/**
 * The workbench and routing: the host router that owns the component URL,
 * and the router of its own that every preview renders under.
 */
import { h, provide, type VNodeChild, type VNodeChildAtom } from '@pyreon/core'
import { createRouter, RouterContext, type Router } from '@pyreon/router'

/**
 * The host router that OWNS the component URL (`/<base>/<component>/`).
 *
 * `atlas dev` and `atlas build` run the workbench as a zero app whose router
 * matches `/` and `/:component`; its shell passes this. The workbench reads the
 * selection from it and writes through it — it never parses or builds a path
 * itself, so the base, the trailing slash and what counts as a page are the
 * router's answers alone.
 *
 * Absent (a workbench embedded in someone else's app): the component travels
 * in the query string (`?c=`), because the host's router has never heard of
 * `/<component>/`.
 */
export interface WorkbenchRoute {
  /**
   * The component id the current route names, or `undefined` when it names
   * none (the root, or a path no page answers). Reactive: a router navigation
   * (back / forward) moves the selection.
   */
  id: () => string | undefined
  /**
   * Make the route name `id`, carrying `query` (no leading `?`; may be empty).
   * Replaces the current entry — every keystroke in a control writes, and
   * pushing would make Back walk through typing.
   */
  go: (id: string, query: string) => void
}

/**
 * Wrap a preview so the component under test gets a router of its OWN — an
 * empty memory router — never the workbench's.
 *
 * The workbench is itself a routed app (`atlas dev` / `atlas build`), or is
 * embedded in one, and a previewed component calling `useRoute()` read the
 * WORKBENCH's route (`/button/`) while one calling `useRouter().push()`
 * navigated the workbench away. A memory router has no listeners and no global
 * slot (it is provided through context, never `setActiveRouter`): it lives and
 * dies with the model that holds this scope. Created on first render, so a
 * model that never previews (SSR, a unit test) builds none.
 */
export function previewRouterScope(): (node: VNodeChildAtom) => VNodeChildAtom {
  let own: Router | null = null
  const router = (): Router => (own ??= createRouter({ routes: [], mode: 'memory' }))
  const IsolatedRouter = (props: { children?: VNodeChild }): VNodeChild => {
    provide(RouterContext, router() as never)

    return props.children ?? null
  }

  return (node) => h(IsolatedRouter, null, node)
}
