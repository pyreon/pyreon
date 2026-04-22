import type { ComponentFn } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import {
  createApp,
  customRef,
  effectScope,
  getCurrentScope,
  h,
  inject,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  KeepAlive,
  markRaw,
  onErrorCaptured,
  onRenderTracked,
  onRenderTriggered,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  Teleport,
  version,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
} from '../index'
import {
  beginRender,
  endRender,
  type RenderContext,
} from '../jsx-runtime'

// ─── Test helpers ──────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

function withHookCtx<T>(fn: (ctx: RenderContext) => T): { result: T; ctx: RenderContext } {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
  beginRender(ctx)
  const result = fn(ctx)
  endRender()
  return { result, ctx }
}

describe('readonly() deep nesting', () => {
  it('prevents mutation on nested objects', () => {
    const ro = readonly({ nested: { x: 1 } })
    expect(ro.nested.x).toBe(1)
    expect(() => {
      ;(ro.nested as { x: number }).x = 2
    }).toThrow('readonly')
  })

  it('prevents mutation on deeply nested objects', () => {
    const ro = readonly({ a: { b: { c: 3 } } })
    expect(ro.a.b.c).toBe(3)
    expect(() => {
      ;(ro.a.b as { c: number }).c = 99
    }).toThrow('readonly')
  })

  it('prevents delete on nested objects', () => {
    const ro = readonly({ nested: { x: 1 } }) as Record<string, Record<string, unknown>>
    expect(() => {
      delete ro.nested!.x
    }).toThrow('Cannot delete')
  })

  it('does not wrap ref values in readonly recursively', () => {
    const r = ref(42)
    const ro = readonly({ myRef: r })
    // Accessing the ref should return the ref itself, not a readonly proxy of it
    expect(isRef(ro.myRef)).toBe(true)
    expect(ro.myRef.value).toBe(42)
  })

  it('does not wrap null or non-object values', () => {
    const ro = readonly({ x: null, y: 5, z: 'hello' })
    expect(ro.x).toBe(null)
    expect(ro.y).toBe(5)
    expect(ro.z).toBe('hello')
  })

  it('nested readonly reports isReadonly', () => {
    const ro = readonly({ nested: { x: 1 } })
    expect(isReadonly(ro)).toBe(true)
    expect(isReadonly(ro.nested)).toBe(true)
  })

  it('readonly arrays are immutable', () => {
    const ro = readonly({ items: [1, 2, 3] })
    expect(ro.items[0]).toBe(1)
    expect(() => {
      ;(ro.items as number[])[0] = 99
    }).toThrow('readonly')
    expect(() => {
      ;(ro.items as number[]).push(4)
    }).toThrow('readonly')
  })
})

describe('isReactive()', () => {
  it('returns true for reactive objects', () => {
    const state = reactive({ count: 0 })
    expect(isReactive(state)).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isReactive({ a: 1 })).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isReactive(null)).toBe(false)
    expect(isReactive(undefined)).toBe(false)
    expect(isReactive(42)).toBe(false)
    expect(isReactive('hello')).toBe(false)
  })

  it('returns false for refs', () => {
    const r = ref(0)
    expect(isReactive(r)).toBe(false)
  })

  it('returns false for readonly objects', () => {
    const ro = readonly({ x: 1 })
    expect(isReactive(ro)).toBe(false)
  })
})

describe('isReadonly()', () => {
  it('returns true for readonly objects', () => {
    const ro = readonly({ x: 1 })
    expect(isReadonly(ro)).toBe(true)
  })

  it('returns false for reactive objects', () => {
    const state = reactive({ x: 1 })
    expect(isReadonly(state)).toBe(false)
  })

  it('returns false for plain objects', () => {
    expect(isReadonly({ x: 1 })).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isReadonly(null)).toBe(false)
    expect(isReadonly(undefined)).toBe(false)
    expect(isReadonly(42)).toBe(false)
  })
})

describe('isProxy()', () => {
  it('returns true for reactive objects', () => {
    expect(isProxy(reactive({ x: 1 }))).toBe(true)
  })

  it('returns true for readonly objects', () => {
    expect(isProxy(readonly({ x: 1 }))).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isProxy({ x: 1 })).toBe(false)
  })

  it('returns false for refs', () => {
    expect(isProxy(ref(0))).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isProxy(null)).toBe(false)
    expect(isProxy(42)).toBe(false)
  })
})

describe('markRaw()', () => {
  it('prevents reactive wrapping', () => {
    const raw = markRaw({ count: 0 })
    const result = reactive(raw)
    // Should return the same object — not wrapped
    expect(result).toBe(raw)
  })

  it('returns the same object', () => {
    const obj = { a: 1 }
    expect(markRaw(obj)).toBe(obj)
  })

  it('marked object is not reactive', () => {
    const raw = markRaw({ x: 1 })
    const result = reactive(raw)
    expect(isReactive(result)).toBe(false)
  })
})

describe('effectScope()', () => {
  it('collects and disposes effects', () => {
    const scope = effectScope()
    let runs = 0
    const count = ref(0)

    scope.run(() => {
      watchEffect(() => {
        void count.value
        runs++
      })
    })

    expect(runs).toBe(1)
    count.value = 1
    expect(runs).toBe(2)

    scope.stop()
    count.value = 2
    expect(runs).toBe(2) // Should not run after stop
  })

  it('run returns the function result', () => {
    const scope = effectScope()
    const result = scope.run(() => 42)
    expect(result).toBe(42)
    scope.stop()
  })

  it('run returns undefined after stop', () => {
    const scope = effectScope()
    scope.stop()
    const result = scope.run(() => 42)
    expect(result).toBeUndefined()
  })

  it('active is true until stopped', () => {
    const scope = effectScope()
    expect(scope.active).toBe(true)
    scope.stop()
    expect(scope.active).toBe(false)
  })

  it('stop is idempotent', () => {
    const scope = effectScope()
    scope.stop()
    expect(() => scope.stop()).not.toThrow()
  })

  it('nested scopes are collected by parent', () => {
    const parent = effectScope()
    let childStopped = false

    parent.run(() => {
      const child = effectScope()
      child.run(() => {
        onScopeDispose(() => {
          childStopped = true
        })
      })
    })

    parent.stop()
    expect(childStopped).toBe(true)
  })

  it('detached scopes are not collected by parent', () => {
    const parent = effectScope()
    let childStopped = false
    let child: ReturnType<typeof effectScope> | undefined

    parent.run(() => {
      child = effectScope(true) // detached
      child.run(() => {
        onScopeDispose(() => {
          childStopped = true
        })
      })
    })

    parent.stop()
    expect(childStopped).toBe(false)
    child!.stop()
    expect(childStopped).toBe(true)
  })
})

describe('getCurrentScope()', () => {
  it('returns undefined outside of scope', () => {
    expect(getCurrentScope()).toBeUndefined()
  })

  it('returns current scope inside run', () => {
    const scope = effectScope()
    let captured: ReturnType<typeof getCurrentScope>

    scope.run(() => {
      captured = getCurrentScope()
    })

    expect(captured!).toBe(scope)
    scope.stop()
  })

  it('returns undefined after scope run completes', () => {
    const scope = effectScope()
    scope.run(() => {})
    expect(getCurrentScope()).toBeUndefined()
    scope.stop()
  })
})

describe('onScopeDispose()', () => {
  it('registers cleanup on current scope', () => {
    const scope = effectScope()
    let disposed = false

    scope.run(() => {
      onScopeDispose(() => {
        disposed = true
      })
    })

    expect(disposed).toBe(false)
    scope.stop()
    expect(disposed).toBe(true)
  })

  it('does nothing outside of scope', () => {
    // Should not throw
    expect(() => onScopeDispose(() => {})).not.toThrow()
  })

  it('multiple disposers are all called', () => {
    const scope = effectScope()
    const calls: number[] = []

    scope.run(() => {
      onScopeDispose(() => calls.push(1))
      onScopeDispose(() => calls.push(2))
      onScopeDispose(() => calls.push(3))
    })

    scope.stop()
    expect(calls).toEqual([1, 2, 3])
  })
})

describe('watch() with array source', () => {
  it('watches multiple refs', () => {
    const a = ref(1)
    const b = ref('hello')
    const calls: Array<[unknown[], unknown[]]> = []

    const stop = watch([a, b] as const, (newVals, oldVals) => {
      calls.push([newVals as unknown[], oldVals as unknown[]])
    })

    a.value = 2
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[calls.length - 1]![0]).toEqual([2, 'hello'])

    b.value = 'world'
    expect(calls[calls.length - 1]![0]).toEqual([2, 'world'])

    stop()
  })

  it('watches array with immediate', () => {
    const a = ref(1)
    const b = ref(2)
    const calls: unknown[][] = []

    const stop = watch(
      [a, b],
      (newVals) => {
        calls.push(newVals as unknown[])
      },
      { immediate: true },
    )

    expect(calls[0]).toEqual([1, 2])
    stop()
  })

  it('watches array of getter functions', () => {
    const count = ref(0)
    const calls: unknown[][] = []

    const stop = watch(
      [() => count.value, () => count.value * 2],
      (newVals) => {
        calls.push(newVals as unknown[])
      },
    )

    count.value = 5
    expect(calls[calls.length - 1]).toEqual([5, 10])
    stop()
  })

  it('stop disposes array watcher', () => {
    const a = ref(1)
    const b = ref(2)
    let callCount = 0

    const stop = watch([a, b], () => {
      callCount++
    })

    a.value = 10
    const countAfterChange = callCount

    stop()
    a.value = 20
    expect(callCount).toBe(countAfterChange)
  })

  it('array watch is hook-indexed inside component', () => {
    const a = ref(0)
    const b = ref(0)
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {},
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }

    beginRender(ctx)
    const stop1 = watch([a, b], () => {})
    endRender()

    beginRender(ctx)
    const stop2 = watch([a, b], () => {})
    endRender()

    expect(stop1).toBe(stop2)
    stop1()
  })
})

describe('onErrorCaptured()', () => {
  it('is callable and stores handler in hook context', () => {
    const { ctx } = withHookCtx(() => {
      onErrorCaptured((_err) => true)
    })
    expect(ctx.hooks.length).toBe(1)
    expect(typeof ctx.hooks[0]).toBe('function')
  })

  it('is idempotent on re-render', () => {
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {},
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }

    beginRender(ctx)
    onErrorCaptured(() => true)
    endRender()

    const hooksBefore = ctx.hooks.length

    beginRender(ctx)
    onErrorCaptured(() => false) // Different fn, should not overwrite
    endRender()

    expect(ctx.hooks.length).toBe(hooksBefore)
  })

  it('is a no-op outside component', () => {
    // Should not throw
    expect(() => onErrorCaptured(() => true)).not.toThrow()
  })
})

describe('onRenderTracked()', () => {
  it('is callable (no-op)', () => {
    expect(() => onRenderTracked(() => {})).not.toThrow()
  })
})

describe('onRenderTriggered()', () => {
  it('is callable (no-op)', () => {
    expect(() => onRenderTriggered(() => {})).not.toThrow()
  })
})

describe('Teleport', () => {
  it('renders children into target element', () => {
    const target = document.createElement('div')
    target.id = 'teleport-target'
    document.body.appendChild(target)

    const el = container()
    const vnode = h(
      Teleport as ComponentFn,
      { to: target } as Record<string, unknown>,
      h('span', null, 'teleported'),
    )
    const unmount = mount(vnode, el)

    // Portal should have rendered children
    expect(target.textContent).toBe('teleported')
    unmount()
    target.remove()
  })

  it('renders children into target via string selector', () => {
    const target = document.createElement('div')
    target.id = 'teleport-string-target'
    document.body.appendChild(target)

    const result = Teleport({ to: '#teleport-string-target', children: 'hello' })
    // Should return a Portal VNode (not null)
    expect(result).not.toBeNull()

    target.remove()
  })

  it('returns children when target is not found', () => {
    const result = Teleport({ to: '#nonexistent-target', children: 'fallback' })
    expect(result).toBe('fallback')
  })

  it('returns null when no children and no target', () => {
    const result = Teleport({ to: '#nonexistent-target' })
    expect(result).toBeNull()
  })
})

describe('KeepAlive', () => {
  it('passes through children', () => {
    const result = KeepAlive({ children: 'hello' })
    expect(result).toBe('hello')
  })

  it('returns null without children', () => {
    const result = KeepAlive({})
    expect(result).toBeNull()
  })
})

describe('watchPostEffect()', () => {
  it('works like watchEffect', () => {
    const count = ref(0)
    const values: number[] = []

    const stop = watchPostEffect(() => {
      values.push(count.value)
    })

    count.value = 1
    expect(values).toEqual([0, 1])
    stop()
  })
})

describe('watchSyncEffect()', () => {
  it('works like watchEffect', () => {
    const count = ref(0)
    const values: number[] = []

    const stop = watchSyncEffect(() => {
      values.push(count.value)
    })

    count.value = 1
    expect(values).toEqual([0, 1])
    stop()
  })
})

describe('customRef()', () => {
  it('creates a ref with custom get/set', () => {
    const r = customRef((track, trigger) => {
      let value = 0
      return {
        get() {
          track()
          return value
        },
        set(v: number) {
          value = v
          trigger()
        },
      }
    })

    expect(isRef(r)).toBe(true)
    expect(r.value).toBe(0)

    r.value = 42
    expect(r.value).toBe(42)
  })

  it('customRef integrates with watchEffect', () => {
    const r = customRef((track, trigger) => {
      let value = 'initial'
      return {
        get() {
          track()
          return value
        },
        set(v: string) {
          value = v
          trigger()
        },
      }
    })

    const values: string[] = []
    const stop = watchEffect(() => {
      values.push(r.value)
    })

    r.value = 'updated'
    expect(values).toContain('updated')
    stop()
  })

  it('customRef with debounce pattern', () => {
    let triggerFn: () => void
    const r = customRef((track, trigger) => {
      triggerFn = trigger
      let value = 0
      return {
        get() {
          track()
          return value
        },
        set(v: number) {
          value = v
          // Don't trigger immediately — simulate debounce
        },
      }
    })

    r.value = 10
    expect(r.value).toBe(10) // Value is set

    // Manually trigger
    const values: number[] = []
    const stop = watchEffect(() => {
      values.push(r.value)
    })

    triggerFn!()
    expect(values.length).toBeGreaterThanOrEqual(1)
    stop()
  })
})

describe('version', () => {
  it('is a string starting with 3', () => {
    expect(typeof version).toBe('string')
    expect(version).toMatch(/^3\./)
  })

  it('contains pyreon identifier', () => {
    expect(version).toContain('pyreon')
  })
})

describe('createApp().use()', () => {
  it('installs a plugin', () => {
    let installed = false
    const plugin = {
      install(_app: { mount: Function; use: Function; provide: Function }) {
        installed = true
      },
    }

    const Comp = () => h('div', null, 'app')
    const app = createApp(Comp)
    app.use(plugin)

    expect(installed).toBe(true)
  })

  it('returns app for chaining', () => {
    const plugin = { install() {} }
    const Comp = () => h('div', null, 'app')
    const app = createApp(Comp)
    const result = app.use(plugin)
    expect(result).toBe(app)
  })

  it('chains multiple plugins', () => {
    const installed: string[] = []
    const plugin1 = { install() { installed.push('p1') } }
    const plugin2 = { install() { installed.push('p2') } }

    const Comp = () => h('div', null, 'app')
    createApp(Comp).use(plugin1).use(plugin2)

    expect(installed).toEqual(['p1', 'p2'])
  })
})

describe('createApp().provide()', () => {
  it('returns app for chaining', () => {
    const Comp = () => h('div', null, 'app')
    const app = createApp(Comp)
    const result = app.provide('key', 'value')
    expect(result).toBe(app)
  })

  it('provides value accessible via inject after mount', () => {
    const key = Symbol('app-provide-test')
    let injectedValue: string | undefined

    const Comp = (() => {
      injectedValue = inject(key, 'default') as string
      return h('div', null, 'app')
    }) as ComponentFn

    const el = container()
    const app = createApp(Comp)
    app.provide(key, 'provided-value')
    const unmount = app.mount(el)

    expect(injectedValue).toBe('provided-value')
    unmount()
  })

  it('chains provide and use', () => {
    let installed = false
    const plugin = { install() { installed = true } }
    const Comp = () => h('div', null, 'app')

    createApp(Comp)
      .provide('key', 'value')
      .use(plugin)

    expect(installed).toBe(true)
  })
})

describe('type exports', () => {
  it('exports version as string', () => {
    expect(typeof version).toBe('string')
  })

  // Type-level tests — these just verify the exports exist and are importable.
  // The actual type checking happens via `tsc --noEmit`.
  it('type exports are importable', async () => {
    const mod = await import('../index')
    // Verify runtime exports exist
    expect(mod.version).toBeDefined()
    expect(mod.isReactive).toBeDefined()
    expect(mod.isReadonly).toBeDefined()
    expect(mod.isProxy).toBeDefined()
    expect(mod.markRaw).toBeDefined()
    expect(mod.effectScope).toBeDefined()
    expect(mod.getCurrentScope).toBeDefined()
    expect(mod.onScopeDispose).toBeDefined()
    expect(mod.onErrorCaptured).toBeDefined()
    expect(mod.onRenderTracked).toBeDefined()
    expect(mod.onRenderTriggered).toBeDefined()
    expect(mod.Teleport).toBeDefined()
    expect(mod.KeepAlive).toBeDefined()
    expect(mod.watchPostEffect).toBeDefined()
    expect(mod.watchSyncEffect).toBeDefined()
    expect(mod.customRef).toBeDefined()
  })
})
