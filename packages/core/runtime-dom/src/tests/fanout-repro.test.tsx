/** @jsxImportSource @pyreon/core */
/**
 * Reproduction of the deferred bug from PR #490 (queryReactiveKey-1000 journey).
 *
 * The pure-reactivity unit test (packages/core/reactivity/src/tests/fanout-repro.test.ts)
 * passes — many effects subscribing to one signal all fire on every external
 * .set. So the bug must involve actual Pyreon mount frames (provide/onMount/etc),
 * not just the reactivity primitives.
 *
 * This test mounts a real Pyreon component with N effects subscribing to a
 * shared signal, then writes to that signal in a tight external loop —
 * mirroring the real shape from the queryReactiveKey-1000 journey.
 */
import { For, h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

describe('signal fan-out under tight external write loop — INSIDE mount frame', () => {
  it('100 effects in a Pyreon component — each fires on every external .set', () => {
    const sig = signal(0)
    const counts = new Array(100).fill(0)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const Component = () => {
      for (let i = 0; i < 100; i++) {
        const idx = i
        effect(() => {
          sig()
          counts[idx]++
        })
      }
      return h('div', null, 'mounted')
    }

    const dispose = mount(h(Component, null), root)

    // All 100 effects ran their initial setup.
    for (const c of counts) expect(c).toBe(1)

    // 10 external writes outside any batch.
    for (let i = 1; i <= 10; i++) sig.set(i)

    // Each effect should have re-fired 10 more times → total = 11.
    let failed = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 11) failed++
    }
    expect(failed, `effects with wrong count (out of 100)`).toBe(0)

    dispose()
    root.remove()
  })

  it('100 effects + an extra effect AFTER the loop — all fire on each .set', () => {
    // Real-bug shape: a diagnostic effect placed AFTER the useQuery loop
    // saw 0 re-runs across 10 flips, while a BEFORE-loop one saw 1 of 10.
    const sig = signal(0)
    const counts = new Array(100).fill(0)
    let beforeRuns = 0
    let afterRuns = 0

    const root = document.createElement('div')
    document.body.appendChild(root)

    const Component = () => {
      effect(() => {
        sig()
        beforeRuns++
      })
      for (let i = 0; i < 100; i++) {
        const idx = i
        effect(() => {
          sig()
          counts[idx]++
        })
      }
      effect(() => {
        sig()
        afterRuns++
      })
      return h('div', null, 'mounted')
    }

    const dispose = mount(h(Component, null), root)

    expect(beforeRuns).toBe(1)
    expect(afterRuns).toBe(1)
    for (const c of counts) expect(c).toBe(1)

    for (let i = 1; i <= 10; i++) sig.set(i)

    expect(beforeRuns, 'before-loop effect runs').toBe(11)
    expect(afterRuns, 'after-loop effect runs').toBe(11)
    let failed = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 11) failed++
    }
    expect(failed, `effects with wrong count`).toBe(0)

    dispose()
    root.remove()
  })

  it('the body of each effect ALSO writes to a per-effect local signal (mimics useQuery slot writes)', () => {
    // useQuery's effect body calls observer.setOptions which triggers the
    // observer's subscribe callback which does batch(() => 9 signal.sets).
    // Approximate that with: each outer effect's body creates its own local
    // signal and writes to it in a batch.
    const sig = signal(0)
    const counts = new Array(100).fill(0)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const Component = () => {
      for (let i = 0; i < 100; i++) {
        const idx = i
        const slot = signal('')
        effect(() => {
          sig() // subscribe
          // Mimic batched writes inside the effect body
          slot.set(`run-${counts[idx]}`)
          counts[idx]++
        })
      }
      return h('div', null, 'mounted')
    }

    const dispose = mount(h(Component, null), root)

    for (const c of counts) expect(c).toBe(1)

    for (let i = 1; i <= 10; i++) sig.set(i)

    let failed = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 11) failed++
    }
    expect(failed, `effects with wrong count`).toBe(0)

    dispose()
    root.remove()
  })

  // ─── The real bug shape: <For> wrapping the queries ───────────────────────
  //
  // mountFor (`packages/core/runtime-dom/src/nodes.ts`) wraps its body in
  // effect() but does NOT untrack the child mountChild calls (mountReactive
  // does — line 92 of nodes.ts). As a result, any signal read during a
  // child component's setup tracks against the For effect's run. When the
  // tracked signal flips, For's effect re-runs → runCleanup() disposes ALL
  // inner effects (the per-item setOptions effects) → handleIncrementalUpdate
  // sees keys unchanged → does not re-mount → setOptions effects gone +
  // never recreated. signalWrite fires N times but effectRun stays at the
  // initial-mount count — the exact PR #490 observation.

  it('REGRESSION: 100 effects mounted under <For> re-fire when shared signal flips', () => {
    // Mirrors the queryReactiveKey-1000 shape: a mode/count tuple keys the
    // For so its body mounts QueryAtScale-equivalent ONCE. Inside, N effects
    // subscribe to a separate `reactKey` signal. External flips of reactKey
    // must propagate to all N inner effects.
    const reactKey = signal(0)
    const counts = new Array(100).fill(0)
    const root = document.createElement('div')
    document.body.appendChild(root)

    // Stable single-item array — For mounts the inner component exactly once.
    const items = [{ id: 1 }] as const
    type Item = (typeof items)[number]

    const Inner = (props: { item: Item }) => {
      // Read props.item to keep the component honest — same shape as
      // QueryAtScale (which reads props.mode + props.count). That read
      // tracks against the OUTER For effect via makeReactiveProps' getter.
      void props.item.id

      // Mimic useQuery's "read signal at construction time, OUTSIDE the
      // inner effect" pattern. This is what `new QueryObserver(client,
      // options())` does — options() reads reactKey while activeEffect is
      // the outer effect (For's run), leaking the subscription up.
      const _seed = reactKey() // ← this is the leak

      // Plus: 100 effects each subscribing to reactKey via their own bodies.
      for (let i = 0; i < 100; i++) {
        const idx = i
        effect(() => {
          reactKey()
          counts[idx]++
        })
      }
      return h('div', { 'data-testid': 'inner' }, `mounted ${_seed}`)
    }

    const dispose = mount(
      h(For, {
        each: items,
        by: (it: Item) => it.id,
        children: (it: Item) => h(Inner, { item: it }),
      }),
      root,
    )

    for (const c of counts) expect(c).toBe(1)

    for (let i = 1; i <= 10; i++) reactKey.set(i)

    let failed = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 11) failed++
    }
    expect(failed, `effects with wrong count after 10 flips`).toBe(0)

    dispose()
    root.remove()
  })
})
