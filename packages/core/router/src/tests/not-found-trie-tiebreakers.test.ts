/**
 * Which 404 wins — the not-found trie's depth/specificity tiebreakers.
 *
 * `findNotFoundFallback` decides which `notFoundComponent` renders for an
 * unmatched URL, and inside which layout chain. Its tiebreakers ("deeper chain
 * wins; on a tie, the more specific path wins") were entirely uncovered — the
 * existing 404 tests all use trees with exactly one candidate, where no
 * tiebreak happens.
 *
 * Getting this wrong is not a crash. It renders the WRONG not-found page, or
 * the right one inside the wrong chrome: a `/admin` 404 shown with the public
 * site's header, or a localised `/de` 404 falling back to the English root.
 * Both look like a content mistake rather than a routing bug, which is what
 * makes them expensive to trace.
 *
 * These drive the PUBLIC `resolveRoute`, not the trie internals — the
 * tiebreak is only meaningful through the chain a caller actually receives.
 *
 * The trie was introduced as a performance rewrite of a full route-tree walk
 * (PR-S9), on the stated promise that it "preserves the same tiebreaker
 * semantics". Nothing checked that promise.
 */
import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const Page = () => null
const RootNF = () => null
const AdminNF = () => null
const DeepNF = () => null
const PageNF = () => null

/** The component the synthetic leaf ends up rendering. */
function notFoundLeaf(path: string, routes: RouteRecord[]): unknown {
  const r = resolveRoute(path, routes)
  expect(r.isNotFound, `${path} should have resolved as not-found`).toBe(true)
  return r.matched[r.matched.length - 1]?.component
}

/** The chain's own records, excluding the synthetic leaf. */
function chainPaths(path: string, routes: RouteRecord[]): string[] {
  const r = resolveRoute(path, routes)
  return r.matched.slice(0, -1).map((m) => m.path)
}

describe('not-found tiebreak — deeper chain wins', () => {
  const routes: RouteRecord[] = [
    {
      path: '/',
      component: Page,
      notFoundComponent: RootNF,
      children: [
        { path: 'about', component: Page },
        {
          path: 'admin',
          component: Page,
          notFoundComponent: AdminNF,
          children: [{ path: 'users', component: Page }],
        },
      ],
    },
  ]

  test('an unmatched path under /admin gets the ADMIN not-found, not the root one', () => {
    // The whole point of a nested notFoundComponent. Falling back to the root
    // here would show the public 404 inside the admin area.
    expect(notFoundLeaf('/admin/nope', routes)).toBe(AdminNF)
  })

  test('an unmatched path OUTSIDE /admin still gets the root not-found', () => {
    // The other direction, and the one a naive "deepest wins" implementation
    // breaks: /admin's 404 must not leak to unrelated branches.
    expect(notFoundLeaf('/nope', routes)).toBe(RootNF)
    expect(notFoundLeaf('/about/nope', routes)).toBe(RootNF)
  })

  test('the winning chain carries its ancestors, so the 404 renders in its chrome', () => {
    // A 404 that renders standalone loses the site header/nav — the reason
    // the fallback synthesizes a chain at all rather than returning a leaf.
    const paths = chainPaths('/admin/nope', routes)
    expect(paths.length, 'the chain must include ancestors, not just the leaf').toBeGreaterThan(0)
    expect(paths.some((p) => p.includes('admin')), `chain was ${paths.join(' > ')}`).toBe(true)
  })
})

describe('not-found tiebreak — on equal depth, the more specific path wins', () => {
  // Two layouts at the SAME chain depth (both top-level), differing only in
  // how many URL segments they claim. The deeper URL prefix is the more
  // specific one and must win for a URL beneath it.
  const routes: RouteRecord[] = [
    {
      path: '/shop',
      component: Page,
      notFoundComponent: RootNF,
      children: [{ path: 'a', component: Page }],
    },
    {
      path: '/shop/items',
      component: Page,
      notFoundComponent: DeepNF,
      children: [{ path: 'b', component: Page }],
    },
  ]

  test('/shop/items/nope takes the /shop/items 404, not /shop', () => {
    expect(notFoundLeaf('/shop/items/nope', routes)).toBe(DeepNF)
  })

  test('/shop/nope still takes the /shop 404', () => {
    // The specificity rule must not promote a candidate the URL never reaches.
    expect(notFoundLeaf('/shop/nope', routes)).toBe(RootNF)
  })

  test('registration ORDER does not decide the winner', () => {
    // A tiebreak implemented as last-write-wins passes the two specs above
    // whenever the more specific route happens to be declared second. Reverse
    // the array and the answers must not move.
    const reversed = [...routes].reverse()
    expect(notFoundLeaf('/shop/items/nope', reversed)).toBe(DeepNF)
    expect(notFoundLeaf('/shop/nope', reversed)).toBe(RootNF)
  })
})

describe('not-found tiebreak — two routes claiming the SAME url path', () => {
  // Both of these resolve to the full path `/admin`, so they land on the same
  // trie node and one must displace the other. The rule is the deeper CHAIN
  // wins — a nested `/` > `admin` layout (chain of 2) beats a top-level
  // `/admin` (chain of 1), because the deeper chain carries more chrome.
  //
  // This is the INSERT-side half of the tiebreak, and it is distinct from the
  // lookup-side one: implemented as plain last-write-wins the lookup specs all
  // still pass, so only a same-node collision can catch it.
  const Nested = () => null
  const TopLevel = () => null

  const nested: RouteRecord = {
    path: '/',
    component: Page,
    children: [
      {
        path: 'admin',
        component: Page,
        notFoundComponent: Nested,
        children: [{ path: 'users', component: Page }],
      },
    ],
  }
  const topLevel: RouteRecord = {
    path: '/admin',
    component: Page,
    notFoundComponent: TopLevel,
    children: [{ path: 'reports', component: Page }],
  }

  test('the deeper chain wins when declared FIRST', () => {
    expect(notFoundLeaf('/admin/nope', [nested, topLevel])).toBe(Nested)
  })

  test('the deeper chain wins when declared SECOND', () => {
    // Under last-write-wins this returns TopLevel, and the previous spec keeps
    // passing — which is why both orders are needed to pin the rule.
    expect(notFoundLeaf('/admin/nope', [topLevel, nested])).toBe(Nested)
  })
})

describe('not-found tiebreak — walking off the end of the trie', () => {
  const routes: RouteRecord[] = [
    {
      path: '/shop',
      component: Page,
      notFoundComponent: RootNF,
      children: [{ path: 'a', component: Page }],
    },
  ]

  test('a URL that diverges deep keeps the nearest ancestor 404', () => {
    // The trie walk breaks at the first unknown segment; everything found
    // before that point must still count.
    expect(notFoundLeaf('/shop/unknown/deeper/still', routes)).toBe(RootNF)
  })

  test('a URL that diverges at the FIRST segment finds nothing', () => {
    // No ancestor was ever entered, so there is no fallback to inherit — the
    // route must resolve as an ordinary unmatched path, not borrow /shop's.
    const r = resolveRoute('/elsewhere/nope', routes)
    expect(r.matched.map((m) => m.component)).not.toContain(RootNF)
  })
})

describe('not-found tiebreak — layout beats page', () => {
  test('a layout notFoundComponent wins over a page one at the same prefix', () => {
    // fs-router attaches `notFoundComponent` to BOTH the layout and every page
    // beneath it. The layout's must win, because only it can wrap the leaf in
    // chrome; picking the page's produces a bare 404 on a site that has a
    // layout.
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Page,
        notFoundComponent: RootNF,
        children: [{ path: 'x', component: Page, notFoundComponent: PageNF }],
      },
    ]
    expect(notFoundLeaf('/nope', routes)).toBe(RootNF)
  })

  // The layout-less case depends on a LATE-BOUND registration: the synthetic
  // chrome layout lives in `components.tsx` (it needs JSX), which sits above
  // `match.ts` in the dependency graph, so `components.tsx` registers it at
  // module load. Both states are documented, and both are contracts — a fresh
  // module instance per test so neither can leak into the other.
  test('WITHOUT the chrome registration it degrades to standalone, never a broken chain', async () => {
    // The documented isolation behaviour. Returning a chain with a null parent
    // here would hand the caller something unrenderable.
    vi.resetModules()
    const { resolveRoute: fresh } = await import('../match')
    const routes: RouteRecord[] = [{ path: '/', component: Page, notFoundComponent: PageNF }]
    const r = fresh('/nope', routes)
    expect(r.isNotFound, 'no synthetic chrome is available, so no fallback chain').toBeFalsy()
    expect(r.matched).toEqual([])
  })

  test('WITH the chrome registered, the page-level 404 renders inside it', async () => {
    vi.resetModules()
    const mod = await import('../match')
    const Chrome = () => null
    mod._setDefaultChromeLayout(Chrome as never)
    const routes: RouteRecord[] = [{ path: '/', component: Page, notFoundComponent: PageNF }]
    const r = mod.resolveRoute('/nope', routes)
    expect(r.isNotFound).toBe(true)
    expect(r.matched.length, 'a synthetic parent must be supplied').toBeGreaterThan(1)
    expect(r.matched[0]?.component, 'the synthetic chrome wraps it').toBe(Chrome)
    expect(r.matched[r.matched.length - 1]?.component).toBe(PageNF)
  })
})

describe('not-found tiebreak — the PAGE track has its own tiebreakers', () => {
  // The trie keeps two independent tracks. Everything above exercises the
  // LAYOUT one; `node.page` is a separate insert branch and a separate lookup
  // branch, reached only when no layout candidate exists — the layout-less
  // app shape, where the fallback synthesizes chrome instead.
  //
  // Same two rules, same failure: the wrong 404 renders, silently.
  async function leafWithChrome(path: string, routes: RouteRecord[]): Promise<unknown> {
    vi.resetModules()
    const mod = await import('../match')
    mod._setDefaultChromeLayout((() => null) as never)
    const r = mod.resolveRoute(path, routes)
    expect(r.isNotFound, `${path} should have resolved as not-found`).toBe(true)
    return r.matched[r.matched.length - 1]?.component
  }

  const Shallow = () => null
  const Deep = () => null

  test('a deeper PAGE 404 wins over a shallower one', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Page, notFoundComponent: Shallow },
      { path: '/admin/reports', component: Page, notFoundComponent: Deep },
    ]
    expect(await leafWithChrome('/admin/reports/nope', routes)).toBe(Deep)
  })

  test('and the shallower one still serves paths the deeper never reaches', async () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Page, notFoundComponent: Shallow },
      { path: '/admin/reports', component: Page, notFoundComponent: Deep },
    ]
    expect(await leafWithChrome('/somewhere-else', routes)).toBe(Shallow)
  })

  test('declaration order does not decide the PAGE winner either', async () => {
    const reversed: RouteRecord[] = [
      { path: '/admin/reports', component: Page, notFoundComponent: Deep },
      { path: '/', component: Page, notFoundComponent: Shallow },
    ]
    expect(await leafWithChrome('/admin/reports/nope', reversed)).toBe(Deep)
    expect(await leafWithChrome('/somewhere-else', reversed)).toBe(Shallow)
  })
})

describe('not-found — no candidate at all', () => {
  test('a tree with no notFoundComponent resolves unmatched without inventing one', () => {
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    const r = resolveRoute('/nope', routes)
    expect(r.matched).toEqual([])
  })
})
