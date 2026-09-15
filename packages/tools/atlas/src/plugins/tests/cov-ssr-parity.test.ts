/**
 * `ssrParityPlugin` — the gate in front of the check, and the three refusals.
 *
 * The check itself is covered against the REAL framework in `ssr-parity.test.ts`.
 * What is pinned here is the plugin's own decision ladder, which decides
 * whether a verdict is produced at all:
 *
 *   no runtime            → skip. A verdict computed with ATLAS's copy of the
 *                           framework would be about the instance split, not
 *                           about the component.
 *   no component function → skip. Metadata-only entries are real; a catalog
 *                           carries providers and schemas too.
 *   no DOM                → skip, with the reason. Never a pass.
 *
 * Each of those is a SKIP carrying a reason, and never a pass — "nothing
 * examined this" presenting as "clean" is exactly what `checked` exists to
 * prevent, and this plugin is one of the six that has to honour it.
 */
import { describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { renderToString } from '@pyreon/runtime-server'
import { checkSsrParity, describeMismatch, ssrParityPlugin } from '../ssr-parity'
import * as dom from '../../verify/dom'
import { ensureDom } from '../../verify/dom'
import type { MountRuntime } from '../../verify/harness'
import type { VerifyContext } from '../types'
import type { ComponentIntelligence, Scenario } from '../../core'

beforeAll(async () => {
  const dom = await ensureDom()
  if (!dom.ok) throw new Error(`no DOM for the parity test: ${dom.reason}`)
})

const runtime: MountRuntime = {
  h: h as MountRuntime['h'],
  mount: mount as unknown as MountRuntime['mount'],
  registerErrorHandler: (() => () => {}) as MountRuntime['registerErrorHandler'],
  renderToString: renderToString as unknown as NonNullable<MountRuntime['renderToString']>,
  hydrateRoot: hydrateRoot as unknown as NonNullable<MountRuntime['hydrateRoot']>,
  onHydrationMismatch: onHydrationMismatch as unknown as NonNullable<
    MountRuntime['onHydrationMismatch']
  >,
}

const ctxFor = (component: unknown, args?: Record<string, unknown>): VerifyContext => {
  const scenario = {
    id: 's1',
    component: 'C',
    name: 's1',
    source: 'authored',
    ...(args ? { args } : {}),
  } as Scenario
  const ci = { name: 'C', component, controls: [], axes: [], scenarios: [scenario], tags: [] } as unknown as ComponentIntelligence
  return { scenario, component: ci, components: [ci] } as VerifyContext
}

const Ok = () => h('div', {}, 'ok')

describe('the plugin claims exactly one check', () => {
  it('returns `ssrParity` and nothing else, so it composes', async () => {
    const verdict = await ssrParityPlugin({ runtime }).verify!(ctxFor(Ok))
    expect(Object.keys(verdict)).toEqual(['ssrParity'])
    expect(verdict.ssrParity?.status).toBe('pass')
  })
})

describe('what the plugin refuses to judge', () => {
  it('SKIPS with a reason when no runtime was supplied', async () => {
    // The project could not be loaded. A verdict here would be about Atlas's
    // own copy of the framework.
    const verdict = await ssrParityPlugin().verify!(ctxFor(Ok))
    expect(verdict.ssrParity?.status).toBe('skip')
    expect(verdict.ssrParity?.findings?.[0]?.message, 'and say why').toBeTruthy()
  })

  it('SKIPS a catalog entry that carries no component function', async () => {
    // A provider, a schema, a metadata-only entry. There is nothing to render.
    for (const value of [undefined, null, 'Button', {}]) {
      const verdict = await ssrParityPlugin({ runtime }).verify!(ctxFor(value))
      expect(verdict.ssrParity?.status, String(value)).toBe('skip')
    }
  })

  it('treats a scenario with NO args as an empty args object', async () => {
    // `args` is optional on a scenario. Passing `undefined` into `h` is a
    // different program than passing `{}`, and the difference shows up as a
    // parity failure that is really about the harness.
    const ctx = ctxFor(Ok)
    expect(Object.hasOwn(ctx.scenario, 'args'), 'the fixture really omits it').toBe(false)
    const verdict = await ssrParityPlugin({ runtime }).verify!(ctx)
    expect(verdict.ssrParity?.status).toBe('pass')
  })

  it('SKIPS with the DOM\'s own reason when no DOM can be had', async () => {
    // This check hydrates, so it needs the globals `@pyreon/runtime-dom`
    // reaches for. Without them the honest answer is a skip carrying the
    // remedy — a pass would claim a comparison that never ran.
    const spy = vi
      .spyOn(dom, 'ensureDom')
      .mockResolvedValue({ ok: false, reason: 'install `happy-dom`' })
    try {
      const verdict = await ssrParityPlugin({ runtime }).verify!(ctxFor(Ok, {}))
      expect(verdict.ssrParity?.status).toBe('skip')
      expect(verdict.ssrParity?.findings?.[0]?.message).toContain('install `happy-dom`')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('the wrapper reaches BOTH sides of the comparison', () => {
  it('renders through the project\'s providers on the SSR and the client path', async () => {
    // Same gate and same wrapper as the mount check: a scenario rendered
    // WITHOUT the project's providers would report a parity failure that is
    // really a missing theme.
    const Wrapper = (props: { children?: never }) => h('section', { class: 'w' }, props.children)
    const verdict = await ssrParityPlugin({ runtime, wrapper: Wrapper as never }).verify!(ctxFor(Ok))
    expect(verdict.ssrParity?.status, 'the wrapper renders identically on both sides').toBe('pass')
  })
})

describe('findings are capped and shortened', () => {
  it('reports at most FIVE mismatches — one broken construct reports per node', async () => {
    // A thousand identical lines say nothing the first five do not, and they
    // bury the summary that explains them.
    let report: ((ctx: unknown) => void) | undefined
    const noisy: MountRuntime = {
      ...runtime,
      onHydrationMismatch: ((handler: (ctx: unknown) => void) => {
        report = handler
        return () => {
          report = undefined
        }
      }) as never,
      hydrateRoot: ((container: Element, root: unknown) => {
        for (let i = 0; i < 40; i++) report?.({ type: 'text', path: `div[${i}]`, expected: 'a', actual: 'b' })
        return (runtime.hydrateRoot as never as typeof hydrateRoot)(container, root as never)
      }) as never,
    }
    const [a, b] = [document.createElement('div'), document.createElement('div')]
    const check = await checkSsrParity(noisy, Ok as never, {}, a, b)
    expect(check.status).toBe('fail')
    const mismatches = (check.findings ?? []).filter((f) => f.code === 'hydration-mismatch')
    expect(mismatches.length, 'capped at five').toBe(5)
  })

  it('TRUNCATES a long value rather than putting a rendered subtree in a finding', async () => {
    // Values reach here from user components. A whole subtree buries the one
    // line that names the problem.
    const long = 'x'.repeat(500)
    const line = describeMismatch({ type: 'text', path: 'div', expected: long, actual: 'b' })
    expect(line.length, 'bounded').toBeLessThan(200)
    expect(line).toContain('…')
    expect(line, 'and still names the path').toContain('div')
  })

  it('does NOT truncate a value that already fits', async () => {
    const line = describeMismatch({ type: 'text', path: 'p', expected: 'short', actual: 'b' })
    expect(line).not.toContain('…')
    expect(line).toContain('short')
  })
})

describe('a client mount that throws while comparing', () => {
  it('is a FINDING, and both roots are still torn down', async () => {
    // This check runs once per scenario across a whole catalog, and a leaked
    // root would be charged to the LEAK check of some later, innocent
    // scenario.
    let mounts = 0
    let disposals = 0
    const flaky: MountRuntime = {
      ...runtime,
      hydrateRoot: ((container: Element, root: unknown) => {
        const off = (runtime.hydrateRoot as never as typeof hydrateRoot)(container, root as never)
        return () => {
          disposals += 1
          off()
        }
      }) as never,
      mount: (() => {
        mounts += 1
        throw new Error('client mount refused')
      }) as never,
    }
    const [a, b] = [document.createElement('div'), document.createElement('div')]
    const check = await checkSsrParity(flaky, Ok as never, {}, a, b)

    expect(check.status).toBe('fail')
    expect((check.findings ?? []).map((f) => f.code)).toContain('mount-threw')
    expect((check.findings ?? []).map((f) => f.message).join(' ')).toContain('client mount refused')
    expect(disposals, 'the hydrated root was disposed despite the throw').toBeGreaterThan(0)
  })

  it('renders a NON-ERROR throw as its string form', async () => {
    const odd: MountRuntime = {
      ...runtime,
      renderToString: (() => {
        throw 'renderToString said no'
      }) as never,
    }
    const [a, b] = [document.createElement('div'), document.createElement('div')]
    const check = await checkSsrParity(odd, Ok as never, {}, a, b)
    expect(check.status).toBe('fail')
    expect((check.findings ?? [])[0]?.message).toContain('renderToString said no')
  })
})

describe('a long divergence is TRUNCATED in the finding', () => {
  it('caps each side at 80 characters', async () => {
    // A whole rendered subtree on both sides of "SSR produced X, client
    // produced Y" buries the one line that names the problem — and a
    // design-system component's markup is routinely thousands of characters.
    const Long = () => h('div', {}, 'z'.repeat(400))
    let calls = 0
    const divergent: MountRuntime = {
      ...runtime,
      mount: ((_root: unknown, container: Element) => {
        calls += 1
        container.innerHTML = `<p>${'y'.repeat(400)}</p>`
        return () => {}
      }) as never,
      hydrateRoot: (() => () => {}) as never,
    }
    const [a, b] = [document.createElement('div'), document.createElement('div')]
    const check = await checkSsrParity(divergent, Long as never, {}, a, b)

    expect(calls).toBe(1)
    expect(check.status).toBe('fail')
    const message = (check.findings ?? []).map((f) => f.message).join(' ')
    expect(message).toContain('…')
    expect(message.length, 'bounded rather than the whole subtree').toBeLessThan(300)
  })
})

describe('an EMPTY render is reported as such, not as a blank line', () => {
  it('names `(empty)` when a side produced nothing', async () => {
    // A divergence where one side is empty is the common shape of a
    // browser-only component. `expected , DOM had ` names neither.
    const Empty = () => null
    let calls = 0
    const divergent: MountRuntime = {
      ...runtime,
      // SSR renders nothing; the client renders content. The two paths
      // disagree even though neither threw.
      mount: ((_root: unknown, container: Element) => {
        calls += 1
        container.innerHTML = '<i>client-only</i>'
        return () => {}
      }) as never,
      hydrateRoot: (() => () => {}) as never,
    }
    const [a, b] = [document.createElement('div'), document.createElement('div')]
    const check = await checkSsrParity(divergent, Empty as never, {}, a, b)
    expect(check.status).toBe('fail')
    expect((check.findings ?? []).map((f) => f.message).join(' ')).toContain('(empty)')
  })
})
