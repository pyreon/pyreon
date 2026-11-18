import { h, provide, useContext } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { computed, isClient, signal, untrack } from '@pyreon/reactivity'
import type { Computed, Signal } from '@pyreon/reactivity'
import { resolveRoute } from './match'
import { RouterTabContext } from './tab-context'
import type { ResolvedRoute, RouteRecord, Router, RouterInstance, RouterTab } from './types'

// The per-tab back-stack engine. It lives behind `routerTabs()` so that only an
// app that calls it carries it: `createRouter` reaches this code through the
// value the app passes as `tabs`, never through an import of its own.

/** A tab's resulting stack (root first) for one navigation of a tab-bar router. */
export interface TabPlan {
  tab: string
  stack: string[]
}

/** What `createRouter` hands the tab engine. @internal */
export interface TabHost {
  routes: RouteRecord[]
  /** The router's trailing-slash normalization. */
  normalize: (path: string) => string
  /** The router's initial path, already normalized. */
  initialPath: string
}

/** The live tab engine of one router. @internal */
export interface TabController {
  /** The active tab's name (reactive). */
  readonly active: Signal<string | undefined>
  /** A history entry's tab + stack, when it is one this router can restore. */
  parseStamp(state: unknown): TabPlan | null
  /** How a programmatic navigation to `path` changes the stacks. */
  plan(path: string, replace: boolean): TabPlan
  /** The active tab's stamp for the current history entry. */
  stamp(): Record<string, unknown>
  /** Apply a committed plan. The router calls it inside the batch that moves the path. */
  commit(plan: TabPlan, path: string): void
  /** Add the route records hidden tabs still render, so their loader data survives a commit. */
  keepHidden(activeTab: string, keep: Set<RouteRecord>): void
  /** `[path, plan]` for `selectTab(name)`, `'committed'` when nothing needs to move, `null` for an unknown tab. */
  select(name: string): [string, TabPlan] | 'committed' | null
  stack(name: string): string[]
  route(name: string): ResolvedRoute | undefined
  withTab(name: string, render: () => VNodeChild, router: Router): VNodeChild
}

/** The value `routerTabs()` returns, passed as `createRouter({ tabs })`. */
export interface RouterTabs {
  /** The configured tabs, in order. */
  readonly tabs: readonly RouterTab[]
  /** @internal Called once by `createRouter`. */
  _attach(host: TabHost): TabController
}

/**
 * Per-tab back stacks for a tab-bar app: `createRouter({ routes, tabs:
 * routerTabs([{ name: 'feed', root: '/feed' }, …]) })`. Each tab owns a stack
 * of entries rooted at `root`; `push` / `replace` / `useNavigate()` act on the
 * ACTIVE tab, a path under another tab's root selects that tab and pushes
 * there (the longest root wins), a tab's exact root pops it to the root, and
 * `router.selectTab(name)` switches tabs keeping every stack. Bind a
 * `<Tabs router={router}>` from `@pyreon/primitives` and put a `<RouterView />`
 * in each `<Tab>`.
 *
 * A function rather than a plain array so the tab engine is in the bundle only
 * when an app uses tabs.
 */
export function routerTabs(tabs: RouterTab[]): RouterTabs {
  return { tabs, _attach: (host) => attachTabs(tabs, host) }
}

function pathSegments(path: string): string[] {
  const end = path.search(/[?#]/)
  return (end === -1 ? path : path.slice(0, end)).split('/').filter(Boolean)
}

const findTab = (tabs: readonly RouterTab[], name: string | undefined): RouterTab | undefined =>
  name === undefined ? undefined : tabs.find((t) => t.name === name)

/** The tab whose root is the longest segment-prefix of `path`, if any. */
function tabForPath(tabs: readonly RouterTab[], path: string): RouterTab | undefined {
  const ps = pathSegments(path)
  let best: RouterTab | undefined
  let bestLen = -1
  for (const t of tabs) {
    const rs = pathSegments(t.root)
    if (rs.length > ps.length || rs.length <= bestLen) continue
    if (rs.every((seg, i) => seg === ps[i])) {
      best = t
      bestLen = rs.length
    }
  }

  return best
}

const isTabRoot = (t: RouterTab, path: string): boolean =>
  pathSegments(path).join('/') === pathSegments(t.root).join('/')

/** A history entry's tab + stack, when it is one of `tabs` and well formed. */
function parseStamp(tabs: readonly RouterTab[], state: unknown): TabPlan | null {
  if (state === null || typeof state !== 'object') return null
  const st = state as { __pyreonTab?: unknown; __pyreonTabStack?: unknown }
  if (typeof st.__pyreonTab !== 'string' || findTab(tabs, st.__pyreonTab) === undefined) return null
  const stack = st.__pyreonTabStack
  if (!Array.isArray(stack) || stack.length === 0 || !stack.every((e) => typeof e === 'string')) {
    return null
  }

  return { tab: st.__pyreonTab, stack: stack as string[] }
}

/**
 * The starting tab + stack for the initial URL. A reload (or a return to the
 * page) finds its own stamp on the history entry and restores the stack; a
 * fresh deep link selects the tab whose root prefixes it and PUSHES the path
 * onto that tab's root, so Back returns to the tab's root page.
 */
function initialPlan(tabs: readonly RouterTab[], path: string): TabPlan {
  const stamped = isClient ? parseStamp(tabs, window.history.state) : null
  if (stamped !== null && stamped.stack[stamped.stack.length - 1] === path) return stamped
  const t = tabForPath(tabs, path) ?? tabs[0]!

  return { tab: t.name, stack: isTabRoot(t, path) ? [path] : [t.root, path] }
}

/** One tab's stack signal and its memoized top-entry route, created once per configured tab. */
function tabState(
  t: RouterTab,
  initialStack: string[],
  routes: RouteRecord[],
): { stack: Signal<string[]>; route: Computed<ResolvedRoute> } {
  const stack = signal<string[]>(initialStack)
  // The top as a STRING first, so the route object is rebuilt only when the
  // top actually changes — a tab's leaf view compares routes by identity,
  // and a needless new object would remount the page.
  const top = computed(() => {
    const st = stack()
    return st[st.length - 1] ?? t.root
  })
  // Memoized on the top string too: a dirty-marked recompute that finds the
  // same top must hand back the SAME object, or the equality gate passes a
  // fresh route downstream and the page remounts.
  let lastTop: string | undefined
  let lastRoute: ResolvedRoute | undefined

  const route = computed(() => {
    const path = top()
    if (path !== lastTop || lastRoute === undefined) {
      lastTop = path
      lastRoute = resolveRoute(path, routes)
    }

    return lastRoute
  })

  return { stack, route }
}

function attachTabs(configured: readonly RouterTab[], host: TabHost): TabController {
  const tabs: RouterTab[] = configured.map((t) => ({ name: t.name, root: host.normalize(t.root) }))
  const active = signal<string | undefined>(undefined)
  const stacks = new Map<string, Signal<string[]>>()
  const routesByTab = new Map<string, Computed<ResolvedRoute>>()
  if (tabs.length > 0) {
    const initial = initialPlan(tabs, host.initialPath)
    for (const t of tabs) {
      if (stacks.has(t.name)) continue
      const state = tabState(t, t.name === initial.tab ? initial.stack : [t.root], host.routes)
      stacks.set(t.name, state.stack)
      routesByTab.set(t.name, state.route)
    }
    active.set(initial.tab)
  }

  return {
    active,
    parseStamp: (state) => parseStamp(tabs, state),

    // - exactly a tab's root → select that tab, pop it to the root;
    // - under ANOTHER tab's root → select that tab, push onto its stack;
    // - otherwise → push onto (or replace the top of) the active tab.
    // The root entry is never replaced: a `replace` on a root-only stack pushes.
    plan(path, replace) {
      const cur = findTab(tabs, active.peek()) ?? tabs[0]!
      const target = tabForPath(tabs, path) ?? cur
      const stack = stacks.get(target.name)?.peek() ?? [target.root]
      if (isTabRoot(target, path)) return { tab: target.name, stack: [path] }
      if (target.name !== cur.name) return { tab: target.name, stack: [...stack, path] }
      if (replace && stack.length > 1) return { tab: target.name, stack: [...stack.slice(0, -1), path] }

      return { tab: target.name, stack: [...stack, path] }
    },

    stamp() {
      const tab = active.peek()!

      return { __pyreonTab: tab, __pyreonTabStack: [...(stacks.get(tab)?.peek() ?? [])] }
    },

    commit(plan, path) {
      const top = plan.stack[plan.stack.length - 1]
      stacks.get(plan.tab)?.set(top === path ? plan.stack : [...plan.stack, path])
      active.set(plan.tab)
    },

    keepHidden(activeTab, keep) {
      for (const t of tabs) {
        if (t.name === activeTab) continue
        const r = routesByTab.get(t.name)
        if (r !== undefined) for (const rec of untrack(r).matched) keep.add(rec)
      }
    },

    select(name) {
      if (findTab(tabs, name) === undefined) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon Router] selectTab(${JSON.stringify(name)}): no tab with that name (configured: ${tabs.map((x) => x.name).join(', ')}).`,
          )
        }

        return null
      }
      const stack = stacks.get(name)!.peek()
      if (name === active.peek()) {
        // Re-selecting the active tab pops it to its root — the iOS and Android
        // tab-bar convention. Already at the root: nothing to do.
        if (stack.length <= 1) return 'committed'

        return [stack[0]!, { tab: name, stack: [stack[0]!] }]
      }

      // Switching shows the tab's own top entry and keeps its stack.
      return [stack[stack.length - 1]!, { tab: name, stack: [...stack] }]
    },

    stack: (name) => stacks.get(name)?.() ?? [],
    route: (name) => routesByTab.get(name)?.(),
    withTab: (name, render, router) => h(RouterTabScope as never, { tab: name, render, router }),
  }
}

const RouterTabScope = (props: {
  tab: string
  render: () => VNodeChild
  router: RouterInstance
}): VNodeChild => {
  // A tab's first view sits one level BELOW the views that enclose the tab bar,
  // not at depth 0: `<Tabs router>` inside a root layout route (a zero
  // `_layout.tsx`) would otherwise render `matched[0]` — the layout itself —
  // inside every tab, recursively. The enclosing non-tab views have each
  // claimed a depth by now (`_viewDepth` counts them in mount order); a tab bar
  // nested in another tab's page continues from that tab's depth.
  const outer = useContext(RouterTabContext)
  provide(RouterTabContext, { tab: props.tab, depth: outer?.depth ?? props.router._viewDepth })

  return props.render()
}
