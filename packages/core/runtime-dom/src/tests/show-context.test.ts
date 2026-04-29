import { createContext, Fragment, h, provide, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

const TestCtx = createContext('default')

describe('context inheritance through reactive boundaries', () => {
  it('child inside reactive accessor inherits parent context', async () => {
    let childValue: string | undefined

    function Child() {
      childValue = useContext(TestCtx)
      return h('span', null, childValue)
    }

    function Parent() {
      provide(TestCtx, 'from-parent')
      const show = signal(false)
      setTimeout(() => show.set(true), 10)
      return () => (show() ? h(Child, null) : null)
    }

    const container = document.createElement('div')
    mount(h(Parent, null), container)
    await new Promise((r) => setTimeout(r, 50))
    expect(childValue).toBe('from-parent')
  })

  it('deeply nested context survives through multiple reactive layers', async () => {
    let innerValue: string | undefined

    function Inner() {
      innerValue = useContext(TestCtx)
      return h('span', null, innerValue)
    }

    function Middle() {
      const show = signal(false)
      setTimeout(() => show.set(true), 10)
      return () => (show() ? h(Inner, null) : null)
    }

    function Outer() {
      provide(TestCtx, 'outer-value')
      const show = signal(false)
      setTimeout(() => show.set(true), 5)
      return () => (show() ? h(Middle, null) : null)
    }

    const container = document.createElement('div')
    mount(h(Outer, null), container)
    await new Promise((r) => setTimeout(r, 100))
    expect(innerValue).toBe('outer-value')
  })

  it("sibling providers don't leak context to each other", async () => {
    let childAValue: string | undefined
    let childBValue: string | undefined

    function ChildA() {
      childAValue = useContext(TestCtx)
      return h('span', null, childAValue)
    }

    function ChildB() {
      childBValue = useContext(TestCtx)
      return h('span', null, childBValue)
    }

    function ProviderA() {
      provide(TestCtx, 'A')
      return h(ChildA, null)
    }

    function ProviderB() {
      provide(TestCtx, 'B')
      return h(ChildB, null)
    }

    function App() {
      return h(Fragment, null, h(ProviderA, null), h(ProviderB, null))
    }

    const container = document.createElement('div')
    mount(h(App, null), container)
    await new Promise((r) => setTimeout(r, 50))

    expect(childAValue).toBe('A')
    expect(childBValue).toBe('B')
  })

  it('Show toggle preserves context across hide/show cycle', async () => {
    let childValue: string | undefined
    let mountCount = 0

    function Child() {
      mountCount++
      childValue = useContext(TestCtx)
      return h('span', null, childValue)
    }

    function Parent() {
      provide(TestCtx, 'persistent')
      const show = signal(true)

      // Hide then show again
      setTimeout(() => show.set(false), 10)
      setTimeout(() => show.set(true), 30)

      return () => (show() ? h(Child, null) : null)
    }

    const container = document.createElement('div')
    mount(h(Parent, null), container)
    await new Promise((r) => setTimeout(r, 100))

    expect(childValue).toBe('persistent')
    expect(mountCount).toBe(2) // mounted twice (initial + re-show)
  })

  it('reactive context getter updates JSX without re-running component', async () => {
    const ModeCtx = createContext<() => string>(() => 'light')
    let renderCount = 0

    function Child() {
      const getMode = useContext(ModeCtx)
      renderCount++
      // Reading the getter inside a reactive accessor — updates when mode changes
      return h('span', null, () => getMode())
    }

    function Parent() {
      const mode = signal<string>('light')
      provide(ModeCtx, () => mode())
      setTimeout(() => mode.set('dark'), 10)
      return h(Child, null)
    }

    const container = document.createElement('div')
    mount(h(Parent, null), container)

    expect(container.textContent).toBe('light')

    await new Promise((r) => setTimeout(r, 50))
    expect(container.textContent).toBe('dark')
    // Component setup ran once — JSX expression re-evaluated reactively
    expect(renderCount).toBe(1)
  })

  it('nested Show inside For with context', async () => {
    const ItemCtx = createContext('none')
    const collected: string[] = []

    function Item() {
      const val = useContext(ItemCtx)
      collected.push(val)
      return h('li', null, val)
    }

    function Parent() {
      provide(ItemCtx, 'parent-provided')
      const items = signal([1, 2, 3])
      const show = signal(false)
      setTimeout(() => show.set(true), 10)

      return () => (show() ? h('ul', null, ...items().map((i) => h(Item, { key: i }))) : null)
    }

    const container = document.createElement('div')
    mount(h(Parent, null), container)
    await new Promise((r) => setTimeout(r, 50))

    expect(collected.length).toBe(3)
    expect(collected.every((v) => v === 'parent-provided')).toBe(true)
  })

  // ── Lock-in for the context-truncation fix (PR #406) ──────────────────────
  //
  // Pre-fix `mountReactive`'s `restoreContextStack` did
  // `stack.length = savedLength` in its finally block — which destroyed
  // every provider frame that the synchronous mount had pushed via
  // `provide()`. Signal-driven re-runs of `_bind` / `renderEffect` inside
  // the mounted subtree later saw a half-empty stack and `useContext()`
  // silently fell back to the default. The original symptom was
  // `<PyreonUI mode={signal()}>` toggling not propagating to consumers
  // — discovered while writing PR #406's regression e2e and traced back
  // through the binding subscription chain to this stack truncation.
  //
  // The fix has two cooperating layers; each provides defense-in-depth
  // for the other, so this assertion would still pass if you revert
  // EITHER alone — but reverting BOTH layers together fails it. To
  // bisect-verify cleanly, revert both:
  //   1. `packages/core/core/src/context.ts:restoreContextStack` — change
  //      the finally block back to `stack.length = savedLength` (truncate
  //      everything fn() pushed).
  //   2. `packages/core/reactivity/src/effect.ts:_bind` — remove the
  //      `_snapshotCapture` capture/restore wiring so re-runs call fn()
  //      against whatever the live stack happens to be at re-run time.
  //
  // With both reverted, this test fails with `seen[1] === 'default'`.
  //
  // What the test exercises: a `_bind` text binding inside a child mounted
  // through a reactive accessor (which goes through `mountReactive`). The
  // binding subscribes to a signal and reads `useContext(Ctx)`. After
  // initial mount, the provider frame is at risk of being truncated by
  // `mountReactive`'s cleanup — toggling the signal forces the binding to
  // re-run, which re-reads context. If either fix is in place, the
  // re-read finds the provider frame and returns the provided value.
  it('binding re-runs preserve context lookup across mountReactive cleanup boundary (PR #406 splice + snapshot capture)', async () => {
    const Ctx = createContext('default')
    const trigger = signal(0)
    let lastSeen: string | undefined
    let runCount = 0

    function Inner() {
      // JSX text accessor compiles to a `_bind` / renderEffect text binding
      // that subscribes to `trigger` (signal read inside the body) AND
      // captures the external context snapshot at setup time.
      return h('span', null, () => {
        trigger()
        const v = useContext(Ctx)
        lastSeen = v
        runCount++
        return v
      })
    }

    function Provider() {
      // CRITICAL for exercising the bug: `provide()` runs INSIDE the
      // reactive child fn (the accessor `() => h(Provider)` returned by
      // App below). That puts Ctx on the stack DURING `mountReactive`'s
      // restoreContextStack(snapshot, fn) execution — and pre-fix the
      // truncating finally block (`stack.length = savedLength`) destroyed
      // the frame the moment fn returned. If Outer pushed Ctx in its OWN
      // body BEFORE returning the accessor, the frame would already be on
      // the stack at snapshot-capture time and survive truncation
      // unrelated — so the test wouldn't actually exercise the bug.
      provide(Ctx, 'provider-value')
      return h(Inner, null)
    }

    function App() {
      // No provide() here — the provider frame must be pushed strictly
      // inside the reactive accessor body (= inside `mountReactive`'s fn)
      // so the truncation-vs-splice path is reached.
      return () => h(Provider, null)
    }

    const container = document.createElement('div')
    mount(h(App, null), container)
    await new Promise((r) => setTimeout(r, 20))
    expect(lastSeen).toBe('provider-value')
    const initialRunCount = runCount

    // Force the binding's effect to re-run AFTER the synchronous mount
    // has fully unwound. With the broken pre-fix shape, mountReactive's
    // `stack.length = savedLength` finally block has already destroyed
    // the Ctx frame Provider pushed, so this re-run reads useContext
    // against a stack that no longer contains the provider — and
    // `lastSeen` becomes `'default'`.
    trigger.set(1)
    await new Promise((r) => setTimeout(r, 20))
    expect(lastSeen).toBe('provider-value')
    // Sanity: the re-run actually happened. Otherwise the test could
    // pass for the wrong reason (e.g. if the trigger subscription wasn't
    // established because the accessor didn't read `trigger()` reactively).
    expect(runCount).toBeGreaterThan(initialRunCount)
  })
})
