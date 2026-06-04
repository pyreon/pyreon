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

  // ── Lock-in: context survives a reactive re-run (PR #406; owner model) ────
  //
  // Symptom (original): `<PyreonUI mode={signal()}>` toggling not propagating
  // to consumers — traced through the binding subscription chain to context
  // loss when a `_bind` / `renderEffect` inside a `mountReactive` subtree
  // re-ran after setup and resolved `useContext()` against the wrong context
  // scope, falling back to the default.
  //
  // The owner-based context model makes this structural: context lives on the
  // component's EffectScope OWNER, and effects capture the active owner at
  // setup + restore it on each re-run (via `setSnapshotCapture` →
  // `runWithContextOwner`), so a re-run resolves `useContext()` through the
  // same owner chain it was created in. To bisect-verify, revert the owner
  // restore in `packages/core/core/src/context.ts` (the `setSnapshotCapture`
  // block backed by `getContextOwner` / `runWithContextOwner`) and/or the
  // `_snapshotCapture` capture/restore in
  // `packages/core/reactivity/src/effect.ts:_bind` — re-runs then resolve
  // against whatever owner is current, and this test fails with
  // `seen[1] === 'default'`.
  //
  // What the test exercises: a `_bind` text binding inside a child mounted
  // through a reactive accessor (which goes through `mountReactive`). The
  // binding subscribes to a signal and reads `useContext(Ctx)`. Toggling the
  // signal forces the binding to re-run, which re-reads context; with the
  // owner capture/restore in place, the re-read finds the provider and
  // returns the provided value.
  it('binding re-runs preserve context lookup across a mountReactive re-run (PR #406; owner capture/restore)', async () => {
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
      // CRITICAL for exercising the case: `provide()` runs INSIDE the
      // reactive child fn (the accessor `() => h(Provider)` returned by
      // App below). The Provider's own owner scope is established DURING
      // `mountReactive`'s deferred mount (under the owner captured via
      // `runWithContextOwner`), so its provided Ctx lives on a scope that
      // is created + disposed across the boundary's re-runs. If Outer
      // pushed Ctx in its OWN body BEFORE returning the accessor, the
      // value would sit on a longer-lived ancestor owner and survive
      // trivially — so the test wouldn't actually exercise the deferred
      // re-run path.
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
