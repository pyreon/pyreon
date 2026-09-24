/**
 * The mount harness and the runtime `interaction` check.
 *
 * Run against a REAL mount — real `@pyreon/runtime-dom`, real components, real
 * dispatched events. A fake harness would only prove the plugin can read its
 * own return shape, and would keep passing if mounting broke underneath it.
 *
 * The interesting cases are the ones where an error is not returned to the
 * caller: a throw inside an effect, a throw inside a delegated click handler.
 * Those are exactly what a check built on `try { mount() }` alone would miss.
 */
import { effect, signal } from '@pyreon/reactivity'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { h, Portal } from '@pyreon/core'
import { defineComponent } from '../../auto'
import { makeScenario } from '../../core'
import type { ComponentIntelligence, Scenario } from '../../core'
import { mountPlugin, releaseVerifyDom } from '../mount'
import * as dom from '../../verify/dom'
import { ensureDom } from '../../verify/dom'
import { defaultRuntime, driveInteractions, mountScenario } from '../../verify/harness'

/** Finding messages as one string — assertions read the prose, not the shape. */
function messages(check: { findings?: readonly { message: string }[] } | undefined): string {
  return (check?.findings ?? []).map((f) => f.message).join(' ')
}


afterAll(() => {
  releaseVerifyDom()
})

const plugin = mountPlugin()

const scenarioFor = (args: Record<string, unknown>, source: Scenario['source'] = 'authored'): Scenario =>
  makeScenario({ component: 'Probe', name: 'probe', args, source })

const intelligence = (component?: (props: Record<string, unknown>) => unknown): ComponentIntelligence =>
  defineComponent('Probe', component ? { component } : {})

const runVerify = async (
  component: ((props: Record<string, unknown>) => unknown) | undefined,
  args: Record<string, unknown> = {},
  source: Scenario['source'] = 'authored',
) => {
  const result = await plugin.verify!({ scenario: scenarioFor(args, source), component: intelligence(component) })
  return result.interaction!
}

describe('what the check refuses to judge', () => {
  it('SKIPS when the catalog carries no component function', async () => {
    // Metadata-only intelligence is normal — a scanned catalog knows the shape
    // without ever importing the module. Skip, never pass: `checked` exists so
    // "nothing ran" cannot present as "nothing was wrong".
    expect((await runVerify(undefined)).status).toBe('skip')
  })
})

describe('when a DOM cannot be had', () => {
  it('SKIPS with the reason instead of taking the scan down', async () => {
    // The whole contract of this check is that it skips when it cannot mount.
    // `ensureDom` reports "no DOM" as a value, but it can still THROW on a
    // runtime where the window constructor or a `defineProperty` is refused —
    // and letting that escape kills the scan on its first scenario rather than
    // skipping it. Simulated by making the plugin's DOM acquisition fail, which
    // is the only way to reach the path without an exotic runtime.
    const failing = mountPlugin()
    const spy = vi.spyOn(dom, 'ensureDom').mockRejectedValueOnce(new Error('no window here'))
    releaseVerifyDom() // drop the cached DOM so the mock is the one consulted
    try {
      const check = (
        await failing.verify!({
          scenario: scenarioFor({}),
          component: intelligence(() => null),
        })
      ).interaction!
      expect(check.status).toBe('skip')
      expect(messages(check)).toContain('no window here')
    } finally {
      spy.mockRestore()
      releaseVerifyDom() // and drop the failed attempt, so later cases get a real one
    }
  })
})

describe('a scenario that behaves', () => {
  it('passes when it mounts, clicks, and unmounts cleanly', async () => {
    const Good = (props: Record<string, unknown>) =>
      h('button', { onClick: () => {} }, String(props.label ?? 'ok'))
    expect(await runVerify(Good, { label: 'Save' })).toEqual({ status: 'pass' })
  })

  it('passes a component that PORTALS its content elsewhere — the DOM is real, just not here', async () => {
    const Modal = () => h(Portal, { target: document.body }, h('div', { role: 'dialog' }, 'in body'))
    expect((await runVerify(Modal)).status).toBe('pass')
  })
})

describe('a scenario that renders NOTHING (the empty-preview class)', () => {
  // Every other check is TRUE of an empty container — mounts, clicks and
  // unmounts cleanly; SSR agrees with the client — which is how 1,090
  // scenarios verified while 24 components rendered no DOM on the deployed
  // workbench. "Mounted no DOM" is the fact that separates the two.
  it('FAILS a scenario the component owns, naming where the fix lives', async () => {
    const check = await runVerify(() => null, { open: false })
    expect(check.status).toBe('fail')
    expect(check.findings?.map((f) => f.code)).toEqual(['empty-render'])
    expect(check.findings?.[0]?.fix).toContain('atlas.config.ts')
  })

  it('reports, but does not fail, a manufactured edge case — an empty result may be the point', async () => {
    const check = await runVerify(() => null, { children: '' }, 'auto-edge')
    expect(check.status).toBe('pass')
    expect(check.findings?.map((f) => f.code)).toEqual(['empty-render'])
  })

  it('counts TEXT as rendered — a component may be a bare string', async () => {
    expect(await runVerify(() => 'just text')).toEqual({ status: 'pass', findings: [expect.objectContaining({ code: 'nothing-to-drive' })] })
  })

  it('does not count a wrapper\'s own element — the slot is what the component produced', async () => {
    const wrapped = mountPlugin({ wrapper: (props) => h('div', { style: 'display: contents' }, props.children as never) })
    const result = await wrapped.verify!({ scenario: scenarioFor({}), component: intelligence(() => null) })
    expect(result.interaction!.status).toBe('fail')
  })
})

describe('seeded content reaches the mount (the empty-preview class)', () => {
  // Real mount, real DOM: the layout-blocks marker is JSON in the catalog and
  // must become elements HERE, through the runtime's own `h`, or the verify
  // verdict covers an empty container while the canvas shows blocks.
  it('mounts the blocks marker as real elements the component receives as children', async () => {
    const dom = await ensureDom()
    if (!dom.ok) return
    const seen: unknown[] = []
    const Probe = (props: Record<string, unknown>) => {
      seen.push(props.children)
      return h('section', {}, props.children as never)
    }
    const mounted = mountScenario(dom.env, await defaultRuntime(), Probe as never, {
      children: { __atlasContent: 'blocks', count: 2 },
    })
    expect(mounted.errors).toEqual([])
    expect(mounted.container.querySelectorAll('[data-atlas-content="block"]')).toHaveLength(2)
    expect(Array.isArray(seen[0])).toBe(true)
    mounted.dispose()
  })

  it('hands a string seed to the component as its children', async () => {
    const dom = await ensureDom()
    if (!dom.ok) return
    const Probe = (props: Record<string, unknown>) => h('button', {}, props.children as never)
    const mounted = mountScenario(dom.env, await defaultRuntime(), Probe as never, { children: 'Save', size: 'sm' })
    expect(mounted.container.querySelector('button')?.textContent).toBe('Save')
    mounted.dispose()
  })
})

describe('the crash classes it exists to catch', () => {
  it('fails when the component throws on mount', async () => {
    const check = await runVerify(() => {
      throw new Error('boom on mount')
    })
    expect(check.status).toBe('fail')
    expect(messages(check)).toContain('boom on mount')
  })

  it('fails when a scenario\'s ARGS are what break it', async () => {
    // The whole point of verifying per scenario rather than per component: the
    // component is fine, this combination of props is not.
    const Fragile = (props: Record<string, unknown>) =>
      h('span', {}, (props.items as string[]).join(', '))
    expect((await runVerify(Fragile, { items: ['a'] })).status).toBe('pass')
    expect((await runVerify(Fragile, { items: undefined })).status).toBe('fail')
  })

  it('fails when an EFFECT throws — an error the caller never sees', async () => {
    // `mount()` returns normally here; the framework routes the effect error to
    // registered handlers instead. A check built on `try { mount() }` alone
    // reports this component clean.
    const Effectful = () => {
      effect(() => {
        throw new Error('boom in effect')
      })
      return h('span', {}, 'rendered')
    }
    const check = await runVerify(Effectful)
    expect(check.status).toBe('fail')
    expect(messages(check)).toContain('boom in effect')
  })

  it('fails when a CLICK handler throws', async () => {
    // Only reachable because the harness dispatches a real bubbling event
    // through the delegation root, rather than asserting the handler exists.
    const Explosive = () =>
      h(
        'button',
        {
          onClick: () => {
            throw new Error('boom on click')
          },
        },
        'press',
      )
    const check = await runVerify(Explosive)
    expect(check.status).toBe('fail')
    expect(messages(check)).toContain('boom on click')
  })
})

describe('driving interactions', () => {
  it('clicks every interactive element exactly once', async () => {
    const dom = await ensureDom()
    expect(dom.ok, 'these tests need a DOM').toBe(true)
    if (!dom.ok) return

    const clicks = signal(0)
    const Three = () =>
      h(
        'div',
        {},
        h('button', { onClick: () => clicks.set(clicks() + 1) }, 'a'),
        h('button', { onClick: () => clicks.set(clicks() + 1) }, 'b'),
        // Not interactive: a plain div must not be clicked, or every component
        // would report interaction coverage it never had.
        h('div', {}, 'not a control'),
        h('a', { href: '#x', onClick: () => clicks.set(clicks() + 1) }, 'c'),
      )

    const mounted = mountScenario(dom.env, await defaultRuntime(), Three, {})
    const delivered = driveInteractions(mounted)
    mounted.dispose()

    expect(delivered).toBe(3)
    expect(clicks()).toBe(3)
  })

  it('stops instead of spinning when clicking spawns more controls', async () => {
    const dom = await ensureDom()
    if (!dom.ok) return

    // A component that grows a button per click would loop forever against a
    // "click until none are left" strategy.
    const count = signal(1)
    const Growing = () =>
      h(
        'div',
        {},
        () =>
          Array.from({ length: count() }, (_, i) =>
            h('button', { onClick: () => count.set(count() + 1) }, `b${i}`),
          ),
      )

    const mounted = mountScenario(dom.env, await defaultRuntime(), Growing, {})
    const delivered = driveInteractions(mounted, 4)
    mounted.dispose()

    expect(delivered).toBe(4)
  })

  it('reports zero when there is nothing to interact with', async () => {
    const dom = await ensureDom()
    if (!dom.ok) return
    const mounted = mountScenario(dom.env, await defaultRuntime(), () => h('span', {}, 'static'), {})
    expect(driveInteractions(mounted)).toBe(0)
    mounted.dispose()
  })
})

describe('teardown', () => {
  it('removes the container so scenarios cannot see each other', async () => {
    const dom = await ensureDom()
    if (!dom.ok) return
    const mounted = mountScenario(dom.env, await defaultRuntime(), () => h('span', {}, 'x'), {})
    const { container } = mounted
    expect(container.isConnected).toBe(true)
    mounted.dispose()
    expect(container.isConnected).toBe(false)
  })

  it('is idempotent', async () => {
    const dom = await ensureDom()
    if (!dom.ok) return
    const mounted = mountScenario(dom.env, await defaultRuntime(), () => h('span', {}, 'x'), {})
    mounted.dispose()
    expect(() => mounted.dispose()).not.toThrow()
    expect(mounted.errors).toEqual([])
  })
})

describe('declared gates — browserOnly and parts', () => {
  // Both say: an empty render here is not the component's fault. They differ
  // in WHY, and the finding names it.
  it('reports browser-only instead of failing a declared browserOnly component', async () => {
    const plugin2 = mountPlugin({ browserOnly: ['Probe'] })
    const result = await plugin2.verify!({ scenario: scenarioFor({ open: true }), component: intelligence(() => null) })
    expect(result.interaction!.status).toBe('skip')
    expect(result.interaction!.findings?.[0]?.code).toBe('browser-only')
  })

  it('reports part-of, naming the parent, for a declared part', async () => {
    const plugin2 = mountPlugin({ parts: { Probe: 'Tabs' } })
    const result = await plugin2.verify!({ scenario: scenarioFor({}), component: intelligence(() => null) })
    expect(result.interaction!.status).toBe('skip')
    expect(result.interaction!.findings?.[0]?.code).toBe('part-of')
    expect(result.interaction!.findings?.[0]?.message).toContain('<Tabs>')
  })

  it('still judges a gated component that DOES render — the gate covers emptiness only', async () => {
    const plugin2 = mountPlugin({ browserOnly: ['Probe'], parts: { Probe: 'Tabs' } })
    const Throws = () => {
      throw new Error('boom')
    }
    const result = await plugin2.verify!({ scenario: scenarioFor({}), component: intelligence(Throws) })
    expect(result.interaction!.status).toBe('fail')
  })
})

describe('framework dev warnings become findings (audit 2026-09)', () => {
  const verifyWith = async (component: (props: Record<string, unknown>) => unknown) => {
    // A fresh plugin: the catalog pass is memoised per plugin instance.
    const fresh = mountPlugin()
    const result = await fresh.verify!({ scenario: scenarioFor({}), component: intelligence(component) })
    return result.interaction!
  }

  it('records a real `[Pyreon]` warning emitted during mount on the scenario', async () => {
    const spy = vi.spyOn(console, 'warn')
    try {
      const check = await verifyWith(() => h('a', { href: 'javascript:alert(1)' }, 'x'))
      const warning = check.findings?.find((f) => f.code === 'framework-warning')
      expect(warning?.message).toContain('Blocked unsafe URL in "href"')
      expect(warning?.fix).toBeTruthy()
      // Reported on the scenario, not also dumped mid-scan.
      expect(spy.mock.calls.some((c) => String(c[0]).startsWith('[Pyreon]'))).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('a warn-ONCE warning swallowed by the warm-up mount still reaches the first scenario', async () => {
    // The warm-up only runs when a leak verdict is possible, so the runtime is
    // given a GC hook and a (steady) graph reader to take that path.
    const runtime = {
      ...(await defaultRuntime()),
      collectGarbage: async () => {},
      reactiveGraphSize: () => 0,
    }
    let warned = false
    const fresh = mountPlugin({ runtime })
    const component = () => {
      if (!warned) {
        warned = true
        console.warn('[Pyreon] once-per-process defect')
      }
      return h('div', null, 'ok')
    }
    const result = await fresh.verify!({ scenario: scenarioFor({}), component: intelligence(component) })
    expect(warned, 'the warm-up mount ran first and consumed the warning').toBe(true)
    expect(result.interaction?.findings?.map((f) => f.code)).toContain('framework-warning')
  })

  it("a component's own (non-framework) warning passes through untouched", async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const check = await verifyWith(() => {
        console.warn('my app warning')
        return h('div', null, 'ok')
      })
      expect(check.findings?.some((f) => f.code === 'framework-warning') ?? false).toBe(false)
      expect(spy.mock.calls.some((c) => c[0] === 'my app warning')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})
