/**
 * Regression lock: portal children must resolve OWNER-BASED context through
 * every mount path — sync setup, reactive-flip after the setup frame has
 * unwound, inner-flip inside the portal, the polymorphic-text upgrade path,
 * and a keyed-For row added post-mount.
 *
 * Provenance: external finding PZ-03 ("Portals don't see context across the
 * reactive-thunk boundary") was NOT reproducible on main (0.39.0) — all of
 * these shapes pass. The suite is load-bearing regardless: a sensitivity
 * bisect that nulled the owner restore in `mountReactive` (nodes.ts —
 * `ownerAtSetup` capture + `runWithContextOwner` wrap) made the majority of
 * these specs fail with context falling back to its default value, i.e. the
 * exact owner-restore regression class that previously bit deferred island
 * hydration (see anti-patterns.md "Deferred island hydration that mounts
 * WITHOUT re-establishing the marker's context owner"). The real-compiler
 * `_tpl`+`_mountSlot` shape (f) survives that particular null because it
 * routes through `bindPolymorphicText`'s INDEPENDENT owner capture
 * (mount.ts), so the suite discriminates between the two restore sites.
 *
 * The real @pyreon/elements Portal variant of this suite lives in
 * packages/ui-system/elements/src/__tests__/Portal-context-owner.test.ts
 * (elements is a ui-system package — not a devDep of runtime-dom by design;
 * case (e) below mirrors its wrapper-element shape with the core Portal).
 */
import { describe, expect, it } from 'vitest'
import type { VNodeChild } from '@pyreon/core'
import {
  createContext,
  createReactiveContext,
  h,
  Portal,
  provide,
  useContext,
} from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'
import { _mountSlot, _tpl } from '../template'

const Ctx = createContext('DEFAULT')
const ModeCtx = createReactiveContext<'light' | 'dark'>('light')

const flush = () => new Promise((r) => setTimeout(r, 10))

describe('Portal — owner-based context resolution across every mount path', () => {
  it('(a) STATIC: provider → Portal → child reads plain context at setup', () => {
    let seen: string | undefined
    const target = document.createElement('div')

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      return h(Portal, { target }, h(Child, null))
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)
    expect(seen).toBe('PROVIDED')
    expect(target.textContent).toBe('PROVIDED')
    cleanup()
  })

  it('(a2) STATIC: provider → Portal → child reads REACTIVE context', () => {
    let seen: string | undefined
    const target = document.createElement('div')
    const mode = signal<'light' | 'dark'>('dark')

    function Child() {
      const getMode = useContext(ModeCtx)
      seen = getMode()
      return h('span', null, seen)
    }

    function Provider() {
      provide(ModeCtx, () => mode())
      return h(Portal, { target }, h(Child, null))
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)
    expect(seen).toBe('dark')
    cleanup()
  })

  it('(b) REACTIVE-FLIP: accessor mounts the Portal AFTER the setup frame unwound', async () => {
    let seen: string | undefined
    const target = document.createElement('div')
    const open = signal(false)

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      // The reported shape: {() => open() && <Portal>…</Portal>}
      return () => (open() ? h(Portal, { target }, h(Child, null)) : null)
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)
    expect(seen).toBeUndefined() // portal not mounted yet

    open.set(true)
    await flush()

    expect(seen).toBe('PROVIDED')
    expect(target.textContent).toBe('PROVIDED')
    cleanup()
  })

  it('(b2) REACTIVE-FLIP with REACTIVE context (createReactiveContext)', async () => {
    let seen: string | undefined
    const target = document.createElement('div')
    const open = signal(false)
    const mode = signal<'light' | 'dark'>('dark')

    function Child() {
      const getMode = useContext(ModeCtx)
      seen = getMode()
      return h('span', null, seen)
    }

    function Provider() {
      provide(ModeCtx, () => mode())
      return () => (open() ? h(Portal, { target }, h(Child, null)) : null)
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)

    open.set(true)
    await flush()

    expect(seen).toBe('dark')
    cleanup()
  })

  it('(c) INNER-FLIP: reactive accessor INSIDE the portal mounts a context-reading child later', async () => {
    let seen: string | undefined
    const target = document.createElement('div')
    const inner = signal(false)

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      return h(Portal, { target }, () => (inner() ? h(Child, null) : null))
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)
    expect(seen).toBeUndefined()

    inner.set(true)
    await flush()

    expect(seen).toBe('PROVIDED')
    expect(target.textContent).toBe('PROVIDED')
    cleanup()
  })

  it('(e) elements-Portal SHAPE: wrapper element created in body + core Portal, under a reactive flip', async () => {
    // Mirror of packages/ui-system/elements/src/Portal/component.tsx: a
    // per-instance wrapper appended to DOMLocation, children into CorePortal.
    // (The REAL elements Portal is exercised by the sibling suite in
    // packages/ui-system/elements — see the header comment.)
    let seen: string | undefined
    const domLocation = document.createElement('div')
    const open = signal(false)

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function ElementsStylePortal(props: { children?: VNodeChild }) {
      const wrapper = document.createElement('div')
      domLocation.appendChild(wrapper)
      return h(Portal, { target: wrapper }, props.children)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      return () => (open() ? h(ElementsStylePortal, null, h(Child, null)) : null)
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)

    open.set(true)
    await flush()

    expect(seen).toBe('PROVIDED')
    expect(domLocation.textContent).toBe('PROVIDED')
    cleanup()
  })

  it('(h) Portal inside a keyed row ADDED after initial mount (dropdown-per-row)', async () => {
    let seen: string | undefined
    const target = document.createElement('div')
    const rows = signal<{ id: number }[]>([])

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      // Keyed array from a reactive accessor → mountKeyedList / mountReactive.
      return () =>
        rows().map((r) => h('div', { key: r.id }, h(Portal, { target }, h(Child, null))))
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)
    expect(seen).toBeUndefined()

    rows.set([{ id: 1 }]) // row (and its Portal) mounts AFTER setup frame unwound
    await flush()

    expect(seen).toBe('PROVIDED')
    expect(target.textContent).toBe('PROVIDED')
    cleanup()
  })

  it('(f) REAL-COMPILER SHAPE: _tpl + _mountSlot thunk mounting a Portal on a flip', async () => {
    // Byte-equivalent to what transformJSX emits for:
    //   <div class="host">{() => open() && <Portal target={target}><Child/></Portal>}</div>
    // (the inner component JSX is lowered by the automatic runtime to
    // jsx(Portal, ...) === h(Portal, ...)). This path resolves context via
    // bindPolymorphicText's own owner capture (mount.ts), NOT mountReactive's
    // — which is exactly why it must be locked separately.
    let seen: string | undefined
    const target = document.createElement('div')
    const open = signal(false)

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      // NativeItem → VNodeChild is the repo's framework-primitive shape cast
      // for hand-written _tpl output (same as coverage.test.ts).
      return _tpl('<div class="host"><!></div>', (__root) => {
        const __d0 = _mountSlot(
          () => open() && h(Portal, { target }, h(Child, null)),
          __root,
          __root.firstChild as Node,
        )
        return __d0
      }) as unknown as VNodeChild
    }

    const container = document.createElement('div')
    const cleanup = mount(h(Provider, null), container)
    expect(seen).toBeUndefined()

    open.set(true)
    await flush()

    expect(seen).toBe('PROVIDED')
    expect(target.textContent).toBe('PROVIDED')
    cleanup()
  })
})
