import type { ComponentIntelligence, Scenario } from '../../core'
import { installRouter, routerPlugin, uniqueSlugs, urlSlug, withRouteAxis } from '../router'

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
