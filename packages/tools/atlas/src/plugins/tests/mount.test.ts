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
import { afterAll, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { defineComponent } from '../../auto'
import { makeScenario } from '../../core'
import type { ComponentIntelligence, Scenario } from '../../core'
import { mountPlugin, releaseVerifyDom } from '../mount'
import { ensureDom } from '../../verify/dom'
import { defaultRuntime, driveInteractions, mountScenario } from '../../verify/harness'

afterAll(() => {
  releaseVerifyDom()
})

const plugin = mountPlugin()

const scenarioFor = (args: Record<string, unknown>): Scenario =>
  makeScenario({ component: 'Probe', name: 'probe', args, source: 'authored' })

const intelligence = (component?: (props: Record<string, unknown>) => unknown): ComponentIntelligence =>
  defineComponent('Probe', component ? { component } : {})

const runVerify = async (
  component: ((props: Record<string, unknown>) => unknown) | undefined,
  args: Record<string, unknown> = {},
) => {
  const result = await plugin.verify!({ scenario: scenarioFor(args), component: intelligence(component) })
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

describe('a scenario that behaves', () => {
  it('passes when it mounts, clicks, and unmounts cleanly', async () => {
    const Good = (props: Record<string, unknown>) =>
      h('button', { onClick: () => {} }, String(props.label ?? 'ok'))
    expect(await runVerify(Good, { label: 'Save' })).toEqual({ status: 'pass' })
  })

  it('passes a component that renders NOTHING', async () => {
    // Deliberate: a `<Show>` that is false, or a Portal mounting elsewhere,
    // renders an empty container and is perfectly correct. Failing on empty
    // output would flag working components, and one false failure costs more
    // trust than ten true ones earn.
    expect((await runVerify(() => null)).status).toBe('pass')
  })
})

describe('the crash classes it exists to catch', () => {
  it('fails when the component throws on mount', async () => {
    const check = await runVerify(() => {
      throw new Error('boom on mount')
    })
    expect(check.status).toBe('fail')
    expect(check.findings?.[0]).toContain('boom on mount')
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
    expect(check.findings?.join(' ')).toContain('boom in effect')
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
    expect(check.findings?.join(' ')).toContain('boom on click')
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
