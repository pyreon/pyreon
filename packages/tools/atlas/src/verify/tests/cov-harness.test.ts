/**
 * The mount harness's HOST-capability and error-shape arms.
 *
 * Three surfaces, each of which decides whether a verify check can make its
 * claim at all:
 *
 *   · `hostCollectGarbage` — reads the host's GC hook off `globalThis`. Absent,
 *     the leak check SKIPS; present, it runs. Getting the detection wrong in
 *     either direction is silent: a missed hook turns every leak verdict into a
 *     skip, and a phantom one makes the check claim a sweep that never happened.
 *   · `wireReactiveGraph` / `sizeOfGraph` — read the devtools registry off a
 *     LOADED `@pyreon/reactivity` module object. A production build exposes no
 *     registry, and the honest answer there is "no reader", not zero.
 *   · `mountScenario`'s error capture — the framework hands its handlers an
 *     `ErrorContext` (`{ error, component, phase }`), the DOM reports an
 *     uncaught listener exception as an `ErrorEvent`, and a mount throws a bare
 *     `Error`. All three land in the same finding list, and the documented
 *     failure is `threw while mounted: [object Object]` — a finding that names
 *     nothing.
 *
 * `globalThis.Bun` / `globalThis.gc` are HOST capabilities, not the framework:
 * driving them by assignment is the only way to reach the arms, and each spec
 * restores what it replaced.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import {
  driveInteractions,
  hostCollectGarbage,
  mountScenario,
  sizeOfGraph,
  wireReactiveGraph,
  type MountRuntime,
} from '../harness'
import { ensureDom } from '../dom'
import type { ComponentRef } from '../../core'
import type { DomEnv } from '../dom'

type Host = { Bun?: unknown; gc?: unknown }
const host = globalThis as unknown as Host

/** Put a global back exactly as it was — including the "was absent" case. */
function swap(key: 'Bun' | 'gc', value: unknown): () => void {
  const had = Object.hasOwn(host, key)
  const previous = host[key]
  if (value === undefined) delete host[key]
  else host[key] = value
  return () => {
    if (had) host[key] = previous
    else delete host[key]
  }
}

const restores: (() => void)[] = []
afterEach(() => {
  while (restores.length > 0) restores.pop()!()
})
const set = (key: 'Bun' | 'gc', value: unknown): void => {
  restores.push(swap(key, value))
}

describe('hostCollectGarbage — which host hook it finds', () => {
  it('prefers Bun.gc, and asks for a FULL sweep', async () => {
    // `Bun.gc(false)` is a nursery collection: it does not run the
    // FinalizationRegistry callbacks the devtools registry drops nodes
    // through, so the settle loop never reaches its floor. The `true`
    // argument is the whole difference between 5.8s and 58s per answer.
    const calls: boolean[] = []
    set('Bun', { gc: (full: boolean) => calls.push(full) })
    set('gc', undefined)

    const collect = hostCollectGarbage()
    expect(collect, 'Bun.gc is a usable hook').toBeDefined()
    await collect!()
    expect(calls, 'exactly one sweep per call').toEqual([true])
  })

  it('falls back to node\'s --expose-gc global when there is no Bun', async () => {
    let swept = 0
    set('Bun', undefined)
    set('gc', () => {
      swept += 1
    })

    const collect = hostCollectGarbage()
    expect(collect).toBeDefined()
    await collect!()
    expect(swept).toBe(1)
  })

  it('is UNDEFINED when the host offers neither — the leak check then SKIPS', async () => {
    // The load-bearing half. Returning a no-op sweep here would let the leak
    // check report `pass` for a scenario nothing collected — the false green
    // the whole verdict model is written against.
    set('Bun', undefined)
    set('gc', undefined)
    expect(hostCollectGarbage()).toBeUndefined()
  })

  it('ignores a `Bun` that carries no `gc`, rather than crashing on it', async () => {
    // A `Bun` global without `gc` is what a stripped or shimmed runtime looks
    // like. Reaching for `.gc` unguarded would take the scan down.
    set('Bun', {})
    set('gc', undefined)
    expect(hostCollectGarbage()).toBeUndefined()
  })

  it('ignores a non-function `gc` global', () => {
    set('Bun', undefined)
    set('gc', 'not a function')
    expect(hostCollectGarbage()).toBeUndefined()
  })
})

describe('wireReactiveGraph — a registry, or an honest nothing', () => {
  it('returns NO reader when the module exposes no registry', () => {
    // A production build of `@pyreon/reactivity` tree-shakes the devtools
    // registry out. Returning a reader that answers 0 would make every leak
    // verdict a serene pass.
    expect(wireReactiveGraph({})).toEqual({})
    expect(wireReactiveGraph({ getReactiveGraph: 'not a function' })).toEqual({})
  })

  it('returns a reader that counts the live nodes', () => {
    const wired = wireReactiveGraph({
      getReactiveGraph: () => ({ nodes: [1, 2, 3] }),
    })
    expect(typeof wired.reactiveGraphSize).toBe('function')
    expect(wired.reactiveGraphSize!()).toBe(3)
  })

  it('reads through the LIVE module each time, not a captured count', () => {
    // A Vite dep re-optimisation mid-scan replaces the reactivity instance;
    // a captured count would read a dead registry forever.
    let nodes: number[] = []
    const wired = wireReactiveGraph({ getReactiveGraph: () => ({ nodes }) })
    expect(wired.reactiveGraphSize!()).toBe(0)
    nodes = [1, 2]
    expect(wired.reactiveGraphSize!()).toBe(2)
  })
})

describe('sizeOfGraph — activation is per read', () => {
  it('ACTIVATES the devtools bridge before reading', () => {
    // Nodes created before attachment are never recorded, so reading without
    // activating reports 0 for a graph that is not empty.
    let activated = 0
    sizeOfGraph({
      activateReactiveDevtools: () => {
        activated += 1
      },
      getReactiveGraph: () => ({ nodes: [1] }),
    })
    expect(activated).toBe(1)
  })

  it('still reads when the module has no activator', () => {
    // An older reactivity build exposes the graph without the bridge. Calling
    // an absent activator would throw and take the scan down.
    expect(() => sizeOfGraph({ getReactiveGraph: () => ({ nodes: [] }) })).not.toThrow()
    expect(sizeOfGraph({ getReactiveGraph: () => ({ nodes: [7, 8] }) })).toBe(2)
  })

  it('ignores a non-function `activateReactiveDevtools`', () => {
    expect(
      sizeOfGraph({ activateReactiveDevtools: 1, getReactiveGraph: () => ({ nodes: [1] }) }),
    ).toBe(1)
  })
})

describe('mountScenario — what a thrown value is rendered as', () => {
  let env: DomEnv

  const realRuntime = (): MountRuntime => ({
    h: h as MountRuntime['h'],
    mount: mount as unknown as MountRuntime['mount'],
    registerErrorHandler: (() => () => {}) as MountRuntime['registerErrorHandler'],
  })

  /** A runtime whose error handler this test drives directly. */
  const drivable = (): { runtime: MountRuntime; fire: (ctx: unknown) => void } => {
    let handler: ((ctx: unknown) => void) | undefined
    return {
      runtime: {
        ...realRuntime(),
        registerErrorHandler: ((fn: (ctx: unknown) => void) => {
          handler = fn
          return () => {
            handler = undefined
          }
        }) as unknown as MountRuntime['registerErrorHandler'],
      },
      fire: (ctx) => handler?.(ctx),
    }
  }

  beforeAll(async () => {
    const dom = await ensureDom()
    if (!dom.ok) throw new Error(`no DOM for the harness test: ${dom.reason}`)
    env = dom.env
  })

  const Ok: ComponentRef = (() => h('div', {}, 'ok')) as unknown as ComponentRef

  it('names the inner error of a framework ErrorContext, with where it happened', () => {
    // The framework hands handlers `{ error, component, phase }`, not the
    // error. Stringifying it produced `threw while mounted: [object Object]`.
    const { runtime, fire } = drivable()
    const scenario = mountScenario(env, runtime, Ok, {})
    fire({ error: new Error('boom'), component: 'Button', phase: 'mount' })
    expect(scenario.errors[0]).toBe('boom (Button mount)')
    scenario.dispose()
  })

  it('reads a bare `message` when there is no inner error — the ErrorEvent shape', () => {
    const { runtime, fire } = drivable()
    const scenario = mountScenario(env, runtime, Ok, {})
    fire({ message: 'listener blew up' })
    expect(scenario.errors[0]).toBe('listener blew up')
    scenario.dispose()
  })

  it('omits the location when the context carries no component or phase', () => {
    const { runtime, fire } = drivable()
    const scenario = mountScenario(env, runtime, Ok, {})
    fire({ error: new Error('naked') })
    expect(scenario.errors[0], 'no empty parens').toBe('naked')
    scenario.dispose()
  })

  it('recurses into a NESTED context rather than stringifying it', () => {
    const { runtime, fire } = drivable()
    const scenario = mountScenario(env, runtime, Ok, {})
    fire({ error: { error: new Error('deep'), component: 'Inner' }, phase: 'effect' })
    expect(scenario.errors[0]).toContain('deep')
    expect(scenario.errors[0]).not.toContain('[object Object]')
    scenario.dispose()
  })

  it('falls back to String() for an object carrying nothing readable', () => {
    // Not a pretty finding, but an honest one — and the only remaining shape.
    const { runtime, fire } = drivable()
    const scenario = mountScenario(env, runtime, Ok, {})
    fire({ component: 'X' })
    expect(scenario.errors).toHaveLength(1)
    scenario.dispose()
  })

  it('renders a non-object throw as its string form', () => {
    const { runtime, fire } = drivable()
    const scenario = mountScenario(env, runtime, Ok, {})
    fire('a bare string')
    fire(null)
    expect(scenario.errors).toEqual(['a bare string', 'null'])
    scenario.dispose()
  })

  it('captures a throw from BUILDING the tree, before mount is ever reached', () => {
    // `runtime.h` runs first, and a throw there never reaches the framework's
    // error handlers — there is no mounted tree to route it through. Only the
    // harness's own try/catch can see it, and propagating would take the whole
    // scan down on the first bad scenario.
    const rt: MountRuntime = {
      ...realRuntime(),
      h: (() => {
        throw new Error('cannot render')
      }) as MountRuntime['h'],
    }
    const scenario = mountScenario(env, rt, Ok, {})
    expect(scenario.errors.join(' ')).toContain('cannot render')
    expect(scenario.container, 'the container is still returned, so teardown is uniform').toBeTruthy()
    expect(() => scenario.dispose(), 'and teardown still works with nothing mounted').not.toThrow()
  })
})

describe('mountScenario — the wrapper and the host it mounts into', () => {
  let env: DomEnv
  beforeAll(async () => {
    const dom = await ensureDom()
    if (!dom.ok) throw new Error(dom.reason)
    env = dom.env
  })

  const runtime = (): MountRuntime => ({
    h: h as MountRuntime['h'],
    mount: mount as unknown as MountRuntime['mount'],
    registerErrorHandler: (() => () => {}) as MountRuntime['registerErrorHandler'],
  })

  it('passes the scenario to the wrapper as `children`', () => {
    // No Atlas-specific contract to learn: a project's existing provider
    // component works unchanged.
    const Inner: ComponentRef = (() => h('span', {}, 'inner')) as unknown as ComponentRef
    const Wrapper: ComponentRef = ((props: { children?: never }) =>
      h('section', { class: 'wrap' }, props.children)) as unknown as ComponentRef

    const scenario = mountScenario(env, runtime(), Inner, {}, Wrapper)
    expect(scenario.errors).toEqual([])
    expect(scenario.container.querySelector('section.wrap span')?.textContent).toBe('inner')
    scenario.dispose()
  })

  it('mounts WITHOUT a wrapper too — the unwrapped tree is the default', () => {
    const Inner: ComponentRef = (() => h('span', {}, 'bare')) as unknown as ComponentRef
    const scenario = mountScenario(env, runtime(), Inner, {})
    expect(scenario.container.querySelector('section')).toBeNull()
    expect(scenario.container.textContent).toContain('bare')
    scenario.dispose()
  })

  it('mounts into a document with NO defaultView, and tears down cleanly', () => {
    // A detached document has no window to listen on. Reaching for
    // `addEventListener` unguarded would take every scenario down on a host
    // whose document is not a window's.
    const doc = env.document
    const viewless = Object.create(doc, {
      defaultView: { value: null, configurable: true },
    }) as Document
    const detached: DomEnv = { document: viewless, teardown: () => {}, kind: 'happy-dom' }

    const Inner: ComponentRef = (() => h('i', {}, 'x')) as unknown as ComponentRef
    const scenario = mountScenario(detached, runtime(), Inner, {})
    expect(scenario.errors).toEqual([])
    expect(() => scenario.dispose()).not.toThrow()
  })

  it('records a teardown throw as a finding for THIS scenario', () => {
    // A teardown error must not leak into the next scenario's verdict.
    const rt: MountRuntime = {
      ...runtime(),
      mount: (() => () => {
        throw new Error('unmount exploded')
      }) as unknown as MountRuntime['mount'],
    }
    const Inner: ComponentRef = (() => h('i', {}, 'x')) as unknown as ComponentRef
    const scenario = mountScenario(env, rt, Inner, {})
    expect(scenario.errors).toEqual([])
    scenario.dispose()
    expect(scenario.errors.join(' ')).toContain('unmount exploded')
  })

  it('is idempotent on dispose — a second call adds no second finding', () => {
    const rt: MountRuntime = {
      ...runtime(),
      mount: (() => () => {
        throw new Error('once')
      }) as unknown as MountRuntime['mount'],
    }
    const Inner: ComponentRef = (() => h('i', {}, 'x')) as unknown as ComponentRef
    const scenario = mountScenario(env, rt, Inner, {})
    scenario.dispose()
    scenario.dispose()
    expect(scenario.errors).toHaveLength(1)
  })
})

describe('mountScenario — clicking', () => {
  let env: DomEnv
  beforeAll(async () => {
    const dom = await ensureDom()
    if (!dom.ok) throw new Error(dom.reason)
    env = dom.env
  })
  const runtime = (): MountRuntime => ({
    h: h as MountRuntime['h'],
    mount: mount as unknown as MountRuntime['mount'],
    registerErrorHandler: (() => () => {}) as MountRuntime['registerErrorHandler'],
  })

  it('falls back to a plain Event on a host with no MouseEvent constructor', () => {
    // A runtime without `MouseEvent` still has to deliver a bubbling click, or
    // the interaction check silently exercises nothing there.
    const MouseEventCtor = (globalThis as { MouseEvent?: unknown }).MouseEvent
    delete (globalThis as { MouseEvent?: unknown }).MouseEvent
    try {
      let clicked = 0
      const Btn: ComponentRef = (() =>
        h('button', {
          onClick: () => {
            clicked += 1
          },
        })) as unknown as ComponentRef
      const scenario = mountScenario(env, runtime(), Btn, {})
      expect(driveInteractions(scenario), 'one clickable element').toBe(1)
      expect(clicked, 'the fallback event still bubbles to the delegation root').toBe(1)
      expect(scenario.errors).toEqual([])
      scenario.dispose()
    } finally {
      ;(globalThis as { MouseEvent?: unknown }).MouseEvent = MouseEventCtor
    }
  })

  it('records a dispatch that THROWS rather than escaping the click walk', () => {
    const Inner: ComponentRef = (() => h('i', {}, 'x')) as unknown as ComponentRef
    const scenario = mountScenario(env, runtime(), Inner, {})
    scenario.click({
      dispatchEvent: () => {
        throw new Error('dispatch refused')
      },
    } as unknown as Element)
    expect(scenario.errors.join(' ')).toContain('dispatch refused')
    scenario.dispose()
  })
})
