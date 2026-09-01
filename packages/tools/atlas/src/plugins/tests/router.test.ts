import type { ComponentIntelligence, Scenario } from '../../core'
import { installRouteFor, installRouter, routerPlugin, setRouteInstaller, uniqueSlugs, urlSlug, withRouteAxis } from '../router'

const scenario = (id: string, name = id): Scenario => ({
  id,
  component: 'UserCard',
  name,
  args: {},
  source: 'auto-variant',
})

const ci = (scenarios: Scenario[]): ComponentIntelligence =>
  ({ name: 'UserCard', controls: [], axes: [], tags: [], scenarios }) as ComponentIntelligence

describe('urlSlug', () => {
  it('makes a URL usable inside a scenario id', () => {
    expect(urlSlug('/users/7')).toBe('users-7')
    expect(urlSlug('/a/b/')).toBe('a-b')
  })

  it('names the root rather than producing an empty fragment', () => {
    // An empty fragment gives `card--at-`, which reads as a truncated id.
    expect(urlSlug('/')).toBe('root')
    expect(urlSlug('')).toBe('root')
  })

  it('drops query and hash — they do not belong in an id', () => {
    expect(urlSlug('/users/7?tab=x#frag')).toBe('users-7')
    // Whichever comes FIRST wins — a `#` before a `?` is a fragment that
    // happens to contain one, not a query.
    expect(urlSlug('/users/7#a?b')).toBe('users-7')
  })

  it('is LINEAR on pathological input', () => {
    // CodeQL flagged `/^\/+|\/+$/` and `/[?#].*$/` as polynomial, on strings
    // with many repetitions of `/` or `#`. I had judged them linear by eye —
    // an anchored quantifier is exactly where that judgement fails.
    const started = Date.now()
    expect(urlSlug('/'.repeat(60000))).toBe('root')
    expect(urlSlug(`${'#'.repeat(60000)}x`)).toBe('root')
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('uniqueSlugs', () => {
  it('deduplicates URLs that slug to the SAME string', () => {
    // `urlSlug` is lossy by design, so `/a/b` and `/a-b` collapse. Left alone
    // that produces two scenarios with one id, and a duplicate id collides in
    // three places at once: the catalog, the verdicts, and the snapshot
    // filenames — where the second silently overwrites the first's baseline.
    expect(uniqueSlugs(['/a/b', '/a-b'])).toEqual(['a-b', 'a-b-2'])
  })

  it('leaves distinct slugs alone', () => {
    expect(uniqueSlugs(['/users/1', '/users/2'])).toEqual(['users-1', 'users-2'])
  })

  it('keeps ids READABLE — suffixed, not hashed', () => {
    // The id reaches a URL and a `data-testid`.
    expect(uniqueSlugs(['/x', '/x', '/x'])).toEqual(['x', 'x-2', 'x-3'])
  })
})

describe('withRouteAxis', () => {
  it('produces UNIQUE ids even when URLs collapse to one slug', () => {
    const rows = withRouteAxis([scenario('c--d')], ['/a/b', '/a-b'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('is the identity when no URLs are configured', () => {
    // The plugin must cost nothing until it is given something to vary.
    const input = [scenario('a'), scenario('b')]
    expect(withRouteAxis(input, [])).toEqual(input)
  })

  it('fans each scenario across the URLs, with unique ids', () => {
    const rows = withRouteAxis([scenario('card--default')], ['/users/1', '/users/2'])
    expect(rows.map((r) => r.id)).toEqual([
      'card--default--at-users-1',
      'card--default--at-users-2',
    ])
    // Ids must stay unique across the whole catalog, or the verdicts, the
    // snapshot filenames and the URL state all collide.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('carries the URL as metadata, NOT as an arg', () => {
    // In `args` it would render as a control the component does not have, and
    // let a user edit something with no effect.
    const [row] = withRouteAxis([scenario('a')], ['/users/1'])
    expect(row?.route).toBe('/users/1')
    expect(row?.args).toEqual({})
  })

  it('keeps the name readable', () => {
    const [row] = withRouteAxis([scenario('a', 'Default')], ['/users/1'])
    expect(row?.name).toBe('Default @ /users/1')
  })
})

describe('routerPlugin', () => {
  it('leaves the catalog untouched with no URLs', () => {
    const input = ci([scenario('a')])
    expect(routerPlugin().decorate!(input, { cwd: '/' })).toBe(input)
  })

  it('adds the axis when URLs are configured', async () => {
    const out = await routerPlugin({ urls: ['/a', '/b'] }).decorate!(ci([scenario('x')]), {
      cwd: '/',
    })
    expect(out.scenarios).toHaveLength(2)
  })
})

describe('installRouter', () => {
  it('creates the router from the LOADED module, not Atlas’s own copy', async () => {
    // The instance discipline. `useRouter()` resolves against module-level
    // state inside a particular copy of `@pyreon/router`; a router made from
    // Atlas's copy is invisible to a component compiled against the project's,
    // which reports "no router" while one demonstrably exists.
    const calls: string[] = []
    const mod = {
      createRouter: (o: Record<string, unknown>) => {
        calls.push(`create:${String(o.url)}`)
        return { id: 'project-router' }
      },
      setActiveRouter: (r: unknown) => calls.push(`set:${r ? 'router' : 'null'}`),
    }

    const dispose = await installRouter(() => mod, [], '/users/7')
    expect(calls).toEqual(['create:/users/7', 'set:router'])

    dispose?.()
    // Cleared on the way out: the active router is module-level state that
    // outlives the scan and would answer for whatever runs next — including a
    // check meant to observe a component WITHOUT one.
    expect(calls).toEqual(['create:/users/7', 'set:router', 'set:null'])
  })

  it('installs nothing when the project has no router', async () => {
    expect(await installRouter(() => undefined, [], '/')).toBeUndefined()
  })

  it('installs nothing when the module is the wrong shape', async () => {
    // A resolved-but-unusable module must not half-install.
    const partial = { createRouter: () => ({}) } as never
    expect(await installRouter(() => partial, [], '/')).toBeUndefined()
  })
})

// ── the axis has to actually route ───────────────────────────────────────────
//
// `installRouter` had zero callers and `Scenario.route` had zero readers, while
// `routerPlugin` was publicly exported. A `routerPlugin({ urls: [...] })` config
// produced the expected doubled scenario count with names like
// `Profile @ /users/999` — and every scenario passed having mounted with NO
// router installed, so two different URLs rendered byte-identically and both
// reported `pass`. A verification tool manufacturing confidence is the worst
// kind of defect: its output is what you check instead of looking.
//
// Bisect-verified: dropping the `setRouteInstaller` call in `routerPlugin`
// makes the install spec see no router and the report-when-unroutable spec see
// no reason.
describe('the route axis installs the router it advertises', () => {
  // `_installRoute` is module-level state that `routerPlugin` WRITES, so a spec
  // that sets it leaves it set for the next one. Every spec below happens to
  // re-run `decorate()` first, which makes the file order-independent by
  // accident rather than by construction — the moment one of them stops doing
  // that, it silently borrows the previous spec's fake router and still passes.
  afterEach(() => {
    setRouteInstaller(undefined)
  })

  const fakeRouterModule = () => {
    const created: Record<string, unknown>[] = []
    const active: unknown[] = []
    return {
      created,
      active,
      mod: {
        createRouter: (options: Record<string, unknown>) => {
          created.push(options)
          return { id: created.length }
        },
        setActiveRouter: (r: unknown) => {
          active.push(r)
        },
      },
    }
  }

  it('a scenario route installs a router built at that URL, then disposes it', async () => {
    const fake = fakeRouterModule()
    routerPlugin({ urls: ['/users/7'], load: () => fake.mod }).decorate?.({
      name: 'Profile',
      scenarios: [{ id: 'default', args: {} }],
    } as never, { cwd: '.' })

    const routed = await installRouteFor('/users/7')
    expect(fake.created).toHaveLength(1)
    expect(fake.created[0]!.url).toBe('/users/7')
    // Installed…
    expect(fake.active).toEqual([{ id: 1 }])
    expect(routed.reason).toBeUndefined()
    expect(routed.disposer).toBeTypeOf('function')

    // …and removed on the way out. A router left installed outlives the
    // scenario and answers for whatever runs next — including a check meant to
    // observe a component WITHOUT one.
    routed.disposer!()
    expect(fake.active[fake.active.length - 1]).toBeNull()
  })

  it('a scenario with no route installs nothing and reports nothing', () => {
    // The non-route path must stay free of both the install and the finding.
    return installRouteFor(undefined).then((r) => {
      expect(r.disposer).toBeUndefined()
      expect(r.reason).toBeUndefined()
    })
  })

  it('a route that CANNOT be applied is reported, not silently skipped', async () => {
    // Configured with urls but no `load`: the axis still produces its
    // scenarios, and the mounting owner must say they were not routed rather
    // than pass them as if they had been.
    routerPlugin({ urls: ['/a'] }).decorate?.({
      name: 'X',
      scenarios: [{ id: 'default', args: {} }],
    } as never, { cwd: '.' })
    const routed = await installRouteFor('/a')
    expect(routed.disposer).toBeUndefined()
    expect(routed.reason).toContain('not applied')
    expect(routed.reason).toContain('/a')
  })

  it('the UNSET seam reports rather than passing silently', async () => {
    // The reset direction of the seam, proven without going through
    // `routerPlugin`. `installRouteFor` is called by whichever plugin owns
    // mounting, which has no way to know whether a router was ever registered
    // — so the un-registered state has to be a REASON, not a throw and not a
    // silent `{}` that reads as "routed fine".
    setRouteInstaller(undefined)
    const routed = await installRouteFor('/unset')
    expect(routed.disposer).toBeUndefined()
    expect(routed.reason).toContain('not applied')
    expect(routed.reason).toContain('/unset')
  })

  it('a load that resolves no module is reported too', async () => {
    routerPlugin({ urls: ['/b'], load: () => undefined }).decorate?.({
      name: 'X',
      scenarios: [{ id: 'default', args: {} }],
    } as never, { cwd: '.' })
    const routed = await installRouteFor('/b')
    expect(routed.disposer).toBeUndefined()
    expect(routed.reason).toContain('did not load')
  })
})
