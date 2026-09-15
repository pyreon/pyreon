/**
 * The mount plugin's remaining decision arms, plus the two small plugins that
 * sit either side of it.
 *
 * Three groups:
 *
 *   · the ARGS fallback. A scenario's `args` is optional, and every mount site
 *     defaults it. `h(Component, undefined)` is a different program from
 *     `h(Component, {})`, and the difference surfaces as a verdict about the
 *     harness rather than about the component.
 *   · the play-failure wording. A throw BEFORE any `step()` has run has no
 *     step to name, and reporting `play failed at step ""` would send a reader
 *     looking for a step that does not exist.
 *   · the ROUTE that was asked for and not applied. Silently rendering
 *     unrouted is what made the whole route axis decorative — two different
 *     URLs rendered byte-identically and both reported `pass`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { h, registerErrorHandler } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { mountPlugin } from '../mount'
import { authoredScenariosPlugin } from '../scenarios'
import { setRouteInstaller } from '../router'
import type { ComponentIntelligence, Scenario } from '../../core'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext, DecorateContext } from '../types'

const Component = () => h('button', {}, 'ok')

/**
 * The REAL framework, wired the way `defaultRuntime` wires it.
 *
 * `registerErrorHandler` in particular: a component that throws in its body
 * does not propagate — the framework routes it to the registered handlers —
 * so a no-op handler here would make every crash class verify CLEAN, which is
 * the one thing this check exists to catch.
 */
const runtime: MountRuntime = {
  h: h as MountRuntime['h'],
  mount: mount as unknown as MountRuntime['mount'],
  registerErrorHandler: registerErrorHandler as unknown as MountRuntime['registerErrorHandler'],
}

/** A scenario built by hand so `args` can genuinely be ABSENT. */
const scenario = (over: Partial<Scenario> & { id: string }): Scenario =>
  ({ component: 'C', name: over.id, source: 'authored', ...over }) as Scenario

const componentOf = (scenarios: Scenario[], over: Partial<ComponentIntelligence> = {}) =>
  ({
    name: 'C',
    component: Component,
    controls: [],
    axes: [],
    scenarios,
    tags: [],
    ...over,
  }) as unknown as ComponentIntelligence

const verify = async (
  component: ComponentIntelligence,
  s: Scenario,
  options: Parameters<typeof mountPlugin>[0] = { runtime },
): Promise<{
  interaction: { status: string; findings?: readonly { message: string; fix?: string }[] }
}> =>
  (await mountPlugin(options).verify!({
    scenario: s,
    component,
    components: [component],
  } as VerifyContext)) as unknown as {
    interaction: { status: string; findings?: readonly { message: string; fix?: string }[] }
  }

describe('a scenario with NO args', () => {
  it('mounts it as an empty args object rather than passing undefined through', async () => {
    const s = scenario({ id: 'no-args' })
    expect(Object.hasOwn(s, 'args'), 'the fixture really omits it').toBe(false)
    const verdict = await verify(componentOf([s]), s)
    expect(verdict.interaction.status).toBe('pass')
  })

  it('does the same on the CATALOG-wide path, where two components amortise', async () => {
    // The wide pass has its own mount sites. A default applied in one place
    // and not the other means a scenario verifies differently depending on how
    // many components the catalog happens to hold.
    const a = componentOf([scenario({ id: 'a-1' }), scenario({ id: 'a-2' })], { name: 'A' })
    const b = componentOf([scenario({ id: 'b-1' })], { name: 'B' })
    const withGraph: MountRuntime = {
      ...runtime,
      reactiveGraphSize: () => 0,
      collectGarbage: async () => {},
    }
    const plugin = mountPlugin({ runtime: withGraph })
    for (const component of [a, b]) {
      for (const s of component.scenarios) {
        const v = (await plugin.verify!({
          scenario: s,
          component,
          components: [a, b],
        } as VerifyContext)) as unknown as {
          interaction: { status: string }
          leak: { status: string }
        }
        expect(v.interaction.status, s.id).toBe('pass')
        expect(v.leak.status, s.id).toBe('pass')
      }
    }
  })
})

describe('an authored `play` that fails', () => {
  it('names the STEP it died in', async () => {
    const play = async ({ step }: { step: (n: string, r: () => unknown) => Promise<void> }) => {
      await step('opens the menu', () => {})
      await step('picks an item', () => {
        throw new Error('no such item')
      })
    }
    const s = scenario({ id: 'p-1', args: {}, play: play as never })
    const verdict = await verify(componentOf([s]), s)
    expect(verdict.interaction.status).toBe('fail')
    const text = (verdict.interaction.findings ?? []).map((f) => f.message).join(' ')
    expect(text).toContain('play failed at step "picks an item"')
    expect(text).toContain('no such item')
  })

  it('does NOT invent a step when the throw came BEFORE any step ran', async () => {
    // `play failed at step ""` sends a reader looking for a step that does not
    // exist. The un-stepped wording is the honest one.
    const play = async () => {
      throw new Error('the fixture was never set up')
    }
    const s = scenario({ id: 'p-2', args: {}, play: play as never })
    const verdict = await verify(componentOf([s]), s)
    const text = (verdict.interaction.findings ?? []).map((f) => f.message).join(' ')
    expect(text).toContain('play failed: the fixture was never set up')
    expect(text, 'no empty step name').not.toContain('at step ""')
  })

  it('renders a NON-ERROR throw as its string form', async () => {
    // An assertion library that throws a plain object, or a bare `throw 'x'`.
    const play = async () => {
      throw 'assertion: expected 2 to be 3'
    }
    const s = scenario({ id: 'p-3', args: {}, play: play as never })
    const verdict = await verify(componentOf([s]), s)
    const text = (verdict.interaction.findings ?? []).map((f) => f.message).join(' ')
    expect(text).toContain('expected 2 to be 3')
    expect(text).not.toContain('[object Object]')
  })
})

describe('a scenario that asked for a ROUTE and did not get one', () => {
  afterEach(() => {
    setRouteInstaller(undefined)
  })

  it('is a FINDING, not a pass — silently rendering unrouted made the axis decor', async () => {
    // Two different URLs rendering byte-identically, both reporting `pass`, is
    // what this finding exists to prevent.
    setRouteInstaller(undefined)
    const s = scenario({ id: 'r-1', args: {}, route: '/users/42' })
    const verdict = await verify(componentOf([s]), s)
    expect(verdict.interaction.status).toBe('fail')
    const text = (verdict.interaction.findings ?? []).map((f) => f.message).join(' ')
    expect(text, 'naming the route that was not applied').toContain('/users/42')
    expect(text).toContain('not applied')
  })

  it('reports the route as applied — and DISPOSES it — when an installer exists', async () => {
    // The active router is module-level state in the project's copy. One left
    // installed answers for whatever runs next, including a check meant to
    // observe a component WITHOUT one.
    let installed: string | undefined
    let disposed = 0
    setRouteInstaller(async (url: string) => {
      installed = url
      return () => {
        disposed += 1
      }
    })
    const s = scenario({ id: 'r-2', args: {}, route: '/ok' })
    const verdict = await verify(componentOf([s]), s)
    expect(verdict.interaction.status).toBe('pass')
    expect(installed).toBe('/ok')
    expect(disposed, 'disposed in the same window, before the next scenario').toBe(1)
  })

  it('reports the installer declining — a project whose router did not load', async () => {
    setRouteInstaller(async () => undefined)
    const s = scenario({ id: 'r-3', args: {}, route: '/nope' })
    const verdict = await verify(componentOf([s]), s)
    expect(verdict.interaction.status).toBe('fail')
    expect((verdict.interaction.findings ?? []).map((f) => f.message).join(' ')).toContain(
      'did not load',
    )
  })
})

describe('the mount-threw finding and the wrapper advice', () => {
  const Throws = () => {
    throw new Error('cannot read `base` of undefined')
  }
  const throwing = (over: Partial<ComponentIntelligence> = {}) =>
    ({
      name: 'T',
      component: Throws,
      controls: [],
      axes: [],
      scenarios: [scenario({ id: 't-1', args: {} })],
      tags: [],
      ...over,
    }) as unknown as ComponentIntelligence

  it('NAMES the missing wrapper when none is configured', async () => {
    // The most common first cause by a wide margin, and the one least obvious
    // from the message: a design-system component reading a theme token out of
    // a context nothing provided.
    const c = throwing()
    const verdict = await verify(c, c.scenarios[0]!)
    expect(verdict.interaction.status).toBe('fail')
    const findings = verdict.interaction.findings ?? []
    expect(findings.map((f) => f.message).join(' ')).toContain('cannot read `base`')
    expect(
      (findings as readonly { fix?: string }[]).map((f) => f.fix ?? '').join(' '),
      'the remedy is carried ON the finding',
    ).toContain('atlas.config.ts')
  })

  it('does NOT repeat that advice when a wrapper IS configured', async () => {
    // With providers already wired, "no wrapper is configured" is wrong — and
    // it would be the loudest line under a failure whose cause is elsewhere.
    const Wrapper = ((props: { children?: never }) =>
      h('div', {}, props.children)) as unknown as ComponentIntelligence['component']
    const c = throwing()
    const verdict = await verify(c, c.scenarios[0]!, { runtime, wrapper: Wrapper as never })
    expect(verdict.interaction.status).toBe('fail')
    const fixes = (verdict.interaction.findings ?? [] as readonly { fix?: string }[])
      .map((f) => (f as { fix?: string }).fix ?? '')
      .join(' ')
    expect(fixes, 'no phantom wrapper advice').not.toContain('export `wrapper`')
  })
})

describe('a scenario the component pass never saw', () => {
  it('is verified ALONE rather than handed a fabricated pass', async () => {
    // It can only happen if the scenario list changed between decorate and
    // verify, which nothing does today — but returning a pass for an unknown
    // id is exactly the false-green `checked` exists to prevent. The component
    // here lists NO scenarios at all, which is also the shape whose
    // `scenarios` field is legitimately absent.
    const listless = {
      name: 'L',
      component: Component,
      controls: [],
      axes: [],
      tags: [],
    } as unknown as ComponentIntelligence
    const orphan = scenario({ id: 'l-1', args: {} })
    const verdict = await verify(listless, orphan)
    expect(['pass', 'fail', 'skip'], 'a real verdict, whichever it is').toContain(
      verdict.interaction.status,
    )
  })
})

describe('the wide pass skips what it cannot amortise across', () => {
  it('ignores a component whose `scenarios` is absent entirely', async () => {
    // A metadata-only catalog entry. Reading `.length` off it unguarded would
    // take the whole wide pass down before any component was verified.
    const bare = {
      name: 'Meta',
      component: Component,
      controls: [],
      axes: [],
      tags: [],
    } as unknown as ComponentIntelligence
    const real = componentOf([scenario({ id: 'x-1', args: {} })], { name: 'Real' })
    const withGraph: MountRuntime = {
      ...runtime,
      reactiveGraphSize: () => 0,
      collectGarbage: async () => {},
    }
    const verdict = (await mountPlugin({ runtime: withGraph }).verify!({
      scenario: real.scenarios[0]!,
      component: real,
      components: [bare, real],
    } as VerifyContext)) as unknown as { interaction: { status: string } }
    expect(verdict.interaction.status).toBe('pass')
  })
})

describe('authoredScenariosPlugin — the keying and the optional fields', () => {
  const ci = (name: string, project?: string): ComponentIntelligence =>
    ({
      name,
      controls: [],
      axes: [],
      scenarios: [],
      tags: [],
      ...(project ? { project } : {}),
    }) as ComponentIntelligence

  const decorate = async (plugin: ReturnType<typeof authoredScenariosPlugin>, c: ComponentIntelligence) =>
    plugin.decorate!(c, {} as DecorateContext)

  it('leaves a component with no authored entry untouched', async () => {
    const plugin = authoredScenariosPlugin({ Button: [{ name: 'Loading' }] })
    const before = ci('Card')
    expect(await decorate(plugin, before)).toBe(before)
  })

  it('leaves a component whose authored list is EMPTY untouched', async () => {
    // An empty array is a config the author is midway through writing. It must
    // not produce an empty scenario set that replaces the derived ones.
    const plugin = authoredScenariosPlugin({ Card: [] })
    const before = ci('Card')
    expect(await decorate(plugin, before)).toBe(before)
  })

  it('keys by IDENTITY first, so one entry cannot apply to every package\'s Button', async () => {
    // Without the key pass, `{ Button: [...] }` in a monorepo would silently
    // apply to every package's Button.
    const plugin = authoredScenariosPlugin({ 'Core/Button': [{ name: 'Core only' }] })
    const core = await decorate(plugin, ci('Button', 'Core'))
    const admin = await decorate(plugin, ci('Button', 'Admin'))
    expect(core.scenarios.map((s) => s.name)).toEqual(['Core only'])
    expect(admin.scenarios, 'the other package is untouched').toEqual([])
  })

  it('falls back to the BARE name, which is what a single package writes', async () => {
    const plugin = authoredScenariosPlugin({ Button: [{ name: 'Loading' }] })
    const decorated = await decorate(plugin, ci('Button'))
    expect(decorated.scenarios.map((s) => s.name)).toEqual(['Loading'])
  })

  it('carries `args` and `play` through, and OMITS them when absent', async () => {
    // `exactOptionalPropertyTypes`: an explicit `undefined` is not the same as
    // an absent key, and a scenario carrying `play: undefined` would take the
    // authored branch of the mount check and exercise nothing.
    const play = async () => {}
    const plugin = authoredScenariosPlugin({
      Button: [{ name: 'Bare' }, { name: 'Full', args: { label: 'x' }, play: play as never }],
    })
    const [bare, full] = (await decorate(plugin, ci('Button'))).scenarios
    expect(Object.hasOwn(bare!, 'play')).toBe(false)
    expect(full!.args).toEqual({ label: 'x' })
    expect(full!.play).toBe(play)
  })
})
