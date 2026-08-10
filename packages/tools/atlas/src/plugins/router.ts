/**
 * A router for components that need one.
 *
 * ── The gap this closes, honestly sized ───────────────────────────────────
 *
 * A component calling `useRouter()` / `useParams()` does NOT crash in the
 * workbench today — Atlas already detects a missing provider and reports that
 * the fix is an `atlas.config.ts` wrapper. So this is not "route components
 * are uncatalogable". It removes a hand-written wrapper, and it adds the thing
 * a wrapper cannot give you: route state as a SCENARIO AXIS, so `/users/:id`
 * renders under several ids and each one is its own verified scenario.
 *
 * ── Why the router comes from the loader ──────────────────────────────────
 *
 * The same instance discipline as every other runtime piece. `useRouter()`
 * resolves `useContext(RouterContext) ?? activeRouter`, and BOTH of those are
 * module-level state inside a particular copy of `@pyreon/router`. A router
 * created from Atlas's copy is invisible to a component compiled against the
 * project's — the component would report "no router" while one demonstrably
 * exists, which is a worse failure than having none.
 */
import type { AtlasPlugin } from './types'
import type { ComponentIntelligence, Scenario } from '../core'

/** The project's `@pyreon/router`, as the module loader resolved it. */
export interface RouterModule {
  createRouter: (options: Record<string, unknown>) => unknown
  setActiveRouter: (router: unknown) => void
}

export interface RouterPluginOptions {
  /**
   * Route records to build the router from.
   *
   * A single catch-all is the default because the workbench is not exercising
   * a route TABLE — it renders one component and the component asks the router
   * questions. A table would make the plugin's answers depend on matching,
   * which is the app's concern, not the component's.
   */
  routes?: unknown[]
  /** URLs to render each scenario under — one scenario per URL. */
  urls?: readonly string[]
  /** Supplies the router module; absent means no router is installed. */
  load?: () => RouterModule | undefined | Promise<RouterModule | undefined>
}

/** A URL turned into a scenario-name fragment: `/users/7` → `users-7`. */
export function urlSlug(url: string): string {
  const cleaned = url.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
  return cleaned.length === 0 ? 'root' : cleaned.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

/**
 * Fan a component's scenarios across the configured URLs.
 *
 * Multiplicative on purpose, and bounded by the caller passing few URLs: a
 * route axis is only worth having if `/users/1` and `/users/999` are separate
 * verified scenarios, and collapsing them to one would answer a question
 * nobody asked. With no URLs configured this is the identity function, so the
 * plugin costs nothing until it is given something to vary.
 */
export function withRouteAxis(
  scenarios: readonly Scenario[],
  urls: readonly string[],
): Scenario[] {
  if (urls.length === 0) return [...scenarios]
  return scenarios.flatMap((s) =>
    urls.map((url) => ({
      ...s,
      id: `${s.id}--at-${urlSlug(url)}`,
      name: `${s.name} @ ${url}`,
      // Carried as scenario METADATA rather than as an arg: it is not a prop,
      // and putting it in `args` would show it as a control the component does
      // not have and let a user "edit" something with no effect.
      route: url,
    })),
  )
}

/**
 * Install a router for the duration of a scan.
 *
 * Returns a disposer. `setActiveRouter(null)` on the way out matters more than
 * it looks: the active router is module-level state in the project's copy, so
 * a router left installed outlives this scan and answers for whatever runs
 * next — including a later check that is supposed to observe a component
 * WITHOUT one.
 */
export async function installRouter(
  load: NonNullable<RouterPluginOptions['load']>,
  routes: unknown[],
  url: string,
): Promise<(() => void) | undefined> {
  const mod = await load()
  if (!mod || typeof mod.createRouter !== 'function' || typeof mod.setActiveRouter !== 'function') {
    return undefined
  }
  const router = mod.createRouter({ routes, url, mode: 'history' })
  mod.setActiveRouter(router)
  return () => mod.setActiveRouter(null)
}

/** A catch-all so any URL matches and the component's questions get answers. */
export const CATCH_ALL_ROUTE = { path: '/:rest*', component: () => null }

/**
 * The plugin — adds the route axis at decorate time.
 *
 * Only the AXIS, deliberately. Installing the router around each mount belongs
 * to whichever plugin owns mounting, and a second plugin reaching into that
 * lifecycle would mean two owners of one router's install/dispose — the shape
 * that produced a double mount and an overwritten verdict the last time two
 * plugins claimed the same stage.
 */
export function routerPlugin(options: RouterPluginOptions = {}): AtlasPlugin {
  const urls = options.urls ?? []
  return {
    name: 'atlas:router',
    decorate(ci: ComponentIntelligence): ComponentIntelligence {
      if (urls.length === 0) return ci
      return { ...ci, scenarios: withRouteAxis(ci.scenarios, urls) }
    },
  }
}
