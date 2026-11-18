/**
 * Lazy context owner + dropped empty scopes.
 *
 * A component's `EffectScope` becomes its children's context owner only on its
 * first `provide()`; a component that never provides is not in the owner
 * chain. At the end of its mount, a scope that nothing registered with, that
 * never became an owner and that nobody was handed (`getCurrentScope()`) is
 * DROPPED: the component's unmount is its subtree's cleanup, nothing else is
 * retained. Each test below pins one half of that contract: either the memory
 * effect, or a shape that must keep its scope (so its disposers still run).
 */
import v8 from 'node:v8'
import vm from 'node:vm'
import { createContext, h, onMount, onUnmount, provide, Show, useContext } from '@pyreon/core'
import {
  _currentScope,
  effect,
  type EffectScope,
  getCurrentScope,
  onScopeDispose,
  signal,
} from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../index'
import { compilePlainModule, mountComponent } from './plain-harness'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

async function collect(): Promise<void> {
  v8.setFlagsFromString('--expose-gc')
  const gc = vm.runInNewContext('gc') as () => void
  await new Promise((r) => setTimeout(r, 0))
  gc()
}

/** Mount under NODE_ENV=production: dev keeps devtools records that hold scopes by design. */
function mountProd<T>(fn: () => T): T {
  const prev = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prev
  }
}

let warnSpy: ReturnType<typeof vi.spyOn> | null = null

afterEach(() => {
  warnSpy?.mockRestore()
  warnSpy = null
  document.body.innerHTML = ''
})

describe('dropped scopes', () => {
  it('a component whose bindings all live in its template retains no scope while mounted', async () => {
    const t = signal('x')
    const scopes: WeakRef<EffectScope>[] = []
    const peek = () => {
      const s = _currentScope()
      if (s) scopes.push(new WeakRef(s))
    }
    const { exports } = compilePlainModule<{ Leaf: () => unknown }>(
      `export function Leaf() { peek(); return <p>{t() + '!'}</p> }`,
      ['Leaf'],
      { t, peek },
    )
    const { container, cleanup } = mountProd(() => mountComponent(exports.Leaf))
    expect(container.textContent).toBe('x!')
    await collect()
    expect(scopes[0]!.deref()).toBeUndefined()
    // Still live, and still fully disposed on unmount.
    t.set('y')
    expect(container.textContent).toBe('y!')
    cleanup()
    expect(subs(t)).toBe(0)
  })

  it('a scope handed out through getCurrentScope() is kept: a later runInScope effect is disposed on unmount', () => {
    const s = signal(0)
    let held: EffectScope | null = null
    let runs = 0
    function Comp() {
      held = getCurrentScope()
      return h('i', null, 'c')
    }
    const host = document.createElement('div')
    const unmount = mount(h(Comp, null), host)
    // After mount: register into the held scope (solid-compat `runWithOwner`).
    held!.runInScope(() => {
      effect(() => {
        s()
        runs++
      })
    })
    s.set(1)
    expect(runs).toBe(2)
    unmount()
    s.set(2)
    expect(runs).toBe(2)
  })

  it('onScopeDispose in setup keeps the scope and runs on unmount', () => {
    const fn = vi.fn()
    function Comp() {
      onScopeDispose(fn)
      return h('i', null, 'c')
    }
    const host = document.createElement('div')
    const unmount = mount(h(Comp, null), host)
    expect(fn).not.toHaveBeenCalled()
    unmount()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('an effect in setup keeps the scope and is disposed on unmount', () => {
    const s = signal(0)
    let runs = 0
    function Comp() {
      effect(() => {
        s()
        runs++
      })

      return h('i', null, 'c')
    }
    const unmount = mount(h(Comp, null), document.createElement('div'))
    unmount()
    s.set(1)
    expect(runs).toBe(1)
  })

  it('onUnmount and onMount cleanups still run for a component with hooks', () => {
    const order: string[] = []
    function Comp() {
      onMount(() => () => order.push('mount-cleanup'))
      onUnmount(() => order.push('unmount'))
      return h('i', null, 'c')
    }
    const unmount = mount(h(Comp, null), document.createElement('div'))
    unmount()
    expect(order).toEqual(['unmount', 'mount-cleanup'])
  })
})

describe('lazy context owner', () => {
  const Ctx = createContext('default')

  it('provide() in the body reaches children, synchronously and through a later boundary, and never siblings', () => {
    const on = signal(false)
    const seen: string[] = []
    function Reader(props: { tag: string }) {
      seen.push(`${props.tag}:${useContext(Ctx)}`)
      return null
    }
    function Middle() {
      // Not a provider: its children resolve through to Provider.
      return h('div', null, h(Reader, { tag: 'sync' }), h(Show, { when: () => on() }, h(Reader, { tag: 'late' })))
    }
    function Provider() {
      provide(Ctx, 'provided')
      return h(Middle, null)
    }
    const host = document.createElement('div')
    const unmount = mount(h('div', null, h(Provider, null), h(Reader, { tag: 'sibling' })), host)
    on.set(true)
    expect(seen).toEqual(['sync:provided', 'sibling:default', 'late:provided'])
    unmount()
  })

  it('a provide() after a child component mounted warns in dev, and the child does not see it', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen: string[] = []
    function Reader() {
      seen.push(useContext(Ctx))
      return null
    }
    function Late() {
      const child = mount(h(Reader, null), document.createElement('div'))
      void child
      provide(Ctx, 'late')

      return null
    }
    mount(h(Late, null), document.createElement('div'))
    expect(seen).toEqual(['default'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('provide() ran after this component had already mounted children'))
  })

  it('a provide() in onMount warns in dev', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    function InMount() {
      onMount(() => {
        provide(Ctx, 'x')
      })

      return h('i', null, 'c')
    }
    mount(h(InMount, null), document.createElement('div'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('provide() ran after this component had already mounted children'))
  })

  it('a provide() before children does not warn', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    function Early() {
      provide(Ctx, 'x')
      return h('i', null, 'c')
    }
    mount(h(Early, null), document.createElement('div'))
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
