import type { ComponentFn } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import {
  batch,
  computed,
  createApp,
  defineComponent,
  Fragment,
  h,
  inject,
  isRef,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  onUpdated,
  provide,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowRef,
  toRaw,
  toRef,
  toRefs,
  triggerRef,
  unref,
  watch,
  watchEffect,
} from '../index'
import {
  beginRender,
  endRender,
  getCurrentCtx,
  jsx,
  jsxDEV,
  jsxs,
  type RenderContext,
} from '../jsx-runtime'

// ─── Test helpers ──────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Create a hook context for testing hooks outside of a full render cycle */
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

/** Run a hook function multiple times to simulate re-renders */
function createHookRunner<T>(fn: () => T): {
  run: () => T
  ctx: RenderContext
} {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
  return {
    run: () => {
      beginRender(ctx)
      const result = fn()
      endRender()
      return result
    },
    ctx,
  }
}

describe('@pyreon/vue-compat', () => {
  // ─── ref ────────────────────────────────────────────────────────────────

  it('ref() creates reactive ref with .value', () => {
    const count = ref(0)
    expect(count.value).toBe(0)
  })

  it('ref().value setter updates value', () => {
    const count = ref(0)
    count.value = 5
    expect(count.value).toBe(5)
  })

  it('ref() is hook-indexed inside component', () => {
    const runner = createHookRunner(() => {
      const count = ref(42)
      return count
    })
    const r1 = runner.run()
    r1.value = 100
    const r2 = runner.run()
    expect(r1).toBe(r2)
    expect(r2.value).toBe(100)
  })

  it('ref() setter calls scheduleRerender inside component', () => {
    let rerenders = 0
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {
        rerenders++
      },
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }
    beginRender(ctx)
    const count = ref(0)
    endRender()

    count.value = 1
    expect(rerenders).toBe(1)
  })

  // ─── shallowRef ────────────────────────────────────────────────────────

  it('shallowRef() creates a ref (same as ref in Pyreon)', () => {
    const r = shallowRef(42)
    expect(r.value).toBe(42)
    expect(isRef(r)).toBe(true)
    r.value = 100
    expect(r.value).toBe(100)
  })

  // ─── triggerRef ────────────────────────────────────────────────────────

  it('triggerRef forces subscribers to re-run', () => {
    const r = ref(0)
    let runs = 0

    const stop = watchEffect(() => {
      void r.value
      runs++
    })

    expect(runs).toBe(1)
    triggerRef(r)
    expect(runs).toBe(3)
    stop()
  })

  it('triggerRef calls scheduleRerender for hook-indexed refs', () => {
    let rerenders = 0
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {
        rerenders++
      },
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }
    beginRender(ctx)
    const r = ref(0)
    endRender()

    triggerRef(r)
    expect(rerenders).toBe(1)
  })

  it('triggerRef is a no-op if ref has no _signal', () => {
    const fakeRef = { value: 42 } as unknown as ReturnType<typeof ref>
    expect(() => triggerRef(fakeRef)).not.toThrow()
  })

  // ─── isRef ─────────────────────────────────────────────────────────────

  it('isRef() detects refs', () => {
    const r = ref(0)
    expect(isRef(r)).toBe(true)
    expect(isRef(0)).toBe(false)
    expect(isRef({ value: 0 })).toBe(false)
    expect(isRef(null)).toBe(false)

    const c = computed(() => 42)
    expect(isRef(c)).toBe(true)
  })

  it('isRef returns false for undefined', () => {
    expect(isRef(undefined)).toBe(false)
  })

  it('isRef returns false for string', () => {
    expect(isRef('hello')).toBe(false)
  })

  // ─── unref ─────────────────────────────────────────────────────────────

  it('unref() unwraps refs', () => {
    const r = ref(42)
    expect(unref(r)).toBe(42)
    expect(unref(99)).toBe(99)
  })

  // ─── computed ───────────────────────────────────────────────────────────

  it('computed() derives from ref', () => {
    const count = ref(2)
    const doubled = computed(() => count.value * 2)
    expect(doubled.value).toBe(4)

    count.value = 10
    expect(doubled.value).toBe(20)
  })

  it('computed().value is readonly', () => {
    const c = computed(() => 42)
    expect(() => {
      ;(c as { value: number }).value = 99
    }).toThrow('readonly')
  })

  it('computed() is hook-indexed inside component', () => {
    const count = ref(5)
    const runner = createHookRunner(() => {
      return computed(() => count.value * 2)
    })
    const c1 = runner.run()
    expect(c1.value).toBe(10)
    count.value = 10
    const c2 = runner.run()
    expect(c1).toBe(c2)
    expect(c2.value).toBe(20)
  })

  // ─── reactive ──────────────────────────────────────────────────────────

  it('reactive() creates deep reactive object', () => {
    const state = reactive({ count: 0, nested: { value: 'hello' } })
    const values: number[] = []

    const stop = watchEffect(() => {
      values.push(state.count)
    })

    state.count = 1
    state.count = 2

    expect(values).toEqual([0, 1, 2])
    stop()
  })

  it('reactive() is hook-indexed inside component', () => {
    const runner = createHookRunner(() => {
      return reactive({ x: 0 })
    })
    const s1 = runner.run()
    s1.x = 42
    const s2 = runner.run()
    expect(s1).toBe(s2)
    expect(s2.x).toBe(42)
  })

  it('reactive() setter calls scheduleRerender inside component', () => {
    let rerenders = 0
    const ctx: RenderContext = {
      hooks: [],
      scheduleRerender: () => {
        rerenders++
      },
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }
    beginRender(ctx)
    const state = reactive({ count: 0 })
    endRender()

    state.count = 1
    expect(rerenders).toBe(1)
  })

  // ─── shallowReactive ──────────────────────────────────────────────────

  it('shallowReactive() creates reactive object (same as reactive)', () => {
    const state = shallowReactive({ count: 0 })
    const values: number[] = []

    const stop = watchEffect(() => {
      values.push(state.count)
    })

    state.count = 5
    expect(values).toEqual([0, 5])
    stop()
  })

  // ─── readonly ──────────────────────────────────────────────────────────

  it('readonly() prevents mutations', () => {
    const obj = readonly({ count: 0 })
    expect(obj.count).toBe(0)
    expect(() => {
      ;(obj as { count: number }).count = 5
    }).toThrow('readonly')
  })

  it('readonly() prevents delete', () => {
    const obj = readonly({ count: 0 }) as Record<string, unknown>
    expect(() => {
      delete obj.count
    }).toThrow('Cannot delete')
  })

  it('readonly() throws on symbol property set', () => {
    const obj = readonly({ count: 0 })
    const sym = Symbol('test')
    expect(() => {
      ;(obj as Record<symbol, unknown>)[sym] = 'value'
    }).toThrow('readonly')
  })

  it('readonly() is hook-indexed inside component', () => {
    const runner = createHookRunner(() => {
      return readonly({ count: 0 })
    })
    const r1 = runner.run()
    const r2 = runner.run()
    expect(r1).toBe(r2)
  })

  // ─── toRaw ─────────────────────────────────────────────────────────────

  it('toRaw() returns raw object for reactive', () => {
    const original = { count: 0 }
    const state = reactive(original)
    const raw = toRaw(state)
    expect(raw).toBe(original)
  })

  it('toRaw() returns raw object for readonly', () => {
    const original = { count: 0 }
    const ro = readonly(original)
    const raw = toRaw(ro)
    expect(raw).toBe(original)
  })

  it('toRaw() returns same object for plain object', () => {
    const obj = { a: 1 }
    expect(toRaw(obj)).toBe(obj)
  })

  // ─── toRef ─────────────────────────────────────────────────────────────

  it('toRef() creates ref linked to reactive property', () => {
    const state = reactive({ count: 0 })
    const countRef = toRef(state, 'count')

    expect(isRef(countRef)).toBe(true)
    expect(countRef.value).toBe(0)

    countRef.value = 10
    expect(state.count).toBe(10)

    state.count = 20
    expect(countRef.value).toBe(20)
  })

  it('toRef() is hook-indexed inside component', () => {
    const state = reactive({ count: 0 })
    const runner = createHookRunner(() => {
      return toRef(state, 'count')
    })
    const r1 = runner.run()
    const r2 = runner.run()
    expect(r1).toBe(r2)
  })

  // ─── toRefs ────────────────────────────────────────────────────────────

  it('toRefs() converts reactive to refs', () => {
    const state = reactive({ a: 1, b: 'hello' })
    const refs = toRefs(state)

    expect(isRef(refs.a)).toBe(true)
    expect(refs.a.value).toBe(1)
    expect(refs.b.value).toBe('hello')

    refs.a.value = 10
    expect(state.a).toBe(10)
  })

  it('toRefs() is hook-indexed inside component', () => {
    const state = reactive({ x: 1, y: 2 })
    const runner = createHookRunner(() => {
      return toRefs(state)
    })
    const r1 = runner.run()
    const r2 = runner.run()
    expect(r1).toBe(r2)
  })

  // ─── watch ──────────────────────────────────────────────────────────────

  it('watch() fires on ref change', () => {
    const count = ref(0)
    const calls: number[] = []

    const stop = watch(count, (newVal) => {
      calls.push(newVal)
    })

    count.value = 1
    count.value = 2

    expect(calls).toEqual([1, 2])
    stop()
  })

  it('watch() provides old and new values', () => {
    const count = ref(10)
    const history: [number, number | undefined][] = []

    const stop = watch(count, (newVal, oldVal) => {
      history.push([newVal, oldVal])
    })

    count.value = 20
    count.value = 30

    expect(history).toEqual([
      [20, 10],
      [30, 20],
    ])
    stop()
  })

  it('watch() with immediate fires synchronously', () => {
    const count = ref(5)
    const calls: [number, number | undefined][] = []

    const stop = watch(
      count,
      (newVal, oldVal) => {
        calls.push([newVal, oldVal])
      },
      { immediate: true },
    )

    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0]).toEqual([5, undefined])
    stop()
  })

  it('watch() with getter function as source', () => {
    const count = ref(0)
    const calls: number[] = []

    const stop = watch(
      () => count.value * 2,
      (newVal) => {
        calls.push(newVal)
      },
    )

    count.value = 5
    expect(calls).toContain(10)
    stop()
  })

  it('watch() stop function disposes watcher', () => {
    const count = ref(0)
    const calls: number[] = []

    const stop = watch(count, (newVal) => {
      calls.push(newVal)
    })

    count.value = 1
    expect(calls).toEqual([1])

    stop()
    count.value = 2
    expect(calls).toEqual([1])
  })

  it('watch() is hook-indexed inside component', () => {
    const count = ref(0)
    const calls: number[] = []
    const runner = createHookRunner(() => {
      return watch(count, (newVal) => {
        calls.push(newVal)
      })
    })
    const stop1 = runner.run()
    const stop2 = runner.run()
    expect(stop1).toBe(stop2)

    count.value = 1
    expect(calls).toEqual([1])
    stop1()
  })

  it('watch with immediate tracks subsequent changes too', () => {
    const count = ref(0)
    const calls: [number, number | undefined][] = []

    const stop = watch(
      count,
      (newVal, oldVal) => {
        calls.push([newVal, oldVal])
      },
      { immediate: true },
    )

    expect(calls[0]).toEqual([0, undefined])

    count.value = 10
    const lastCall = calls[calls.length - 1]!
    expect(lastCall[0]).toBe(10)

    stop()
  })

  it('watch with getter function and immediate', () => {
    const count = ref(5)
    const calls: [number, number | undefined][] = []

    const stop = watch(
      () => count.value * 2,
      (newVal, oldVal) => {
        calls.push([newVal, oldVal])
      },
      { immediate: true },
    )

    expect(calls[0]).toEqual([10, undefined])
    stop()
  })

  // ─── watchEffect ───────────────────────────────────────────────────────

  it('watchEffect() tracks dependencies', () => {
    const count = ref(0)
    const values: number[] = []

    const stop = watchEffect(() => {
      values.push(count.value)
    })

    count.value = 1
    count.value = 2

    expect(values).toEqual([0, 1, 2])

    stop()
    count.value = 3
    expect(values).toEqual([0, 1, 2])
  })

  it('watchEffect() is hook-indexed inside component', () => {
    const count = ref(0)
    const values: number[] = []
    const runner = createHookRunner(() => {
      return watchEffect(() => {
        values.push(count.value)
      })
    })
    const stop1 = runner.run()
    const stop2 = runner.run()
    expect(stop1).toBe(stop2)

    count.value = 1
    expect(values).toEqual([0, 1])
    stop1()
  })

  // ─── nextTick ──────────────────────────────────────────────────────────

  it('nextTick() resolves after flush', async () => {
    const count = ref(0)
    count.value = 42
    await nextTick()
    expect(count.value).toBe(42)
  })

  // ─── lifecycle (with Pyreon fallback) ──────────────────────────────────

  it('onMounted/onUnmounted lifecycle hooks work with defineComponent', () => {
    const mounted: string[] = []
    const unmounted: string[] = []

    const Comp = defineComponent({
      name: 'TestComp',
      setup() {
        onMounted(() => {
          mounted.push('mounted')
        })
        onUnmounted(() => {
          unmounted.push('unmounted')
        })
        return () => h('div', null, 'test')
      },
    })

    const el = container()
    const unmount = mount(h(Comp, null), el)

    expect(mounted).toEqual(['mounted'])
    expect(unmounted).toEqual([])

    unmount()
    expect(unmounted).toEqual(['unmounted'])
  })

  it('onBeforeMount works (maps to onMount)', () => {
    const calls: string[] = []

    const Comp = defineComponent({
      setup() {
        onBeforeMount(() => {
          calls.push('beforeMount')
        })
        return () => h('div', null, 'test')
      },
    })

    const el = container()
    const unmount = mount(h(Comp, null), el)
    expect(calls).toEqual(['beforeMount'])
    unmount()
  })

  it('onBeforeUnmount works (maps to onUnmount)', () => {
    const calls: string[] = []

    const Comp = defineComponent({
      setup() {
        onBeforeUnmount(() => {
          calls.push('beforeUnmount')
        })
        return () => h('div', null, 'test')
      },
    })

    const el = container()
    const unmount = mount(h(Comp, null), el)
    expect(calls).toEqual([])
    unmount()
    expect(calls).toEqual(['beforeUnmount'])
  })

  it('onUpdated is a function', () => {
    expect(typeof onUpdated).toBe('function')
  })

  it('onMounted queues pendingEffect inside hook context', () => {
    const { ctx } = withHookCtx(() => {
      onMounted(() => {})
    })
    expect(ctx.pendingEffects.length).toBe(1)
  })

  it('onUnmounted pushes to unmountCallbacks inside hook context', () => {
    const calls: string[] = []
    const { ctx } = withHookCtx(() => {
      onUnmounted(() => {
        calls.push('unmounted')
      })
    })
    expect(ctx.unmountCallbacks.length).toBe(1)
    ctx.unmountCallbacks[0]!()
    expect(calls).toEqual(['unmounted'])
  })

  // ─── provide / inject ─────────────────────────────────────────────────

  it('provide/inject with string key', () => {
    provide('theme', 'dark')
    expect(inject('theme')).toBe('dark')
  })

  it('provide/inject with symbol key', () => {
    const key = Symbol('test-key')
    provide(key, { value: 42 })
    expect((inject(key) as { value: number }).value).toBe(42)
  })

  it('inject returns default value when not provided', () => {
    const key = Symbol('missing-key')
    expect(inject(key, 'fallback')).toBe('fallback')
  })

  it('inject returns undefined when not provided and no default', () => {
    const key = Symbol('no-default')
    expect(inject(key)).toBeUndefined()
  })

  it('provide is hook-indexed inside component', () => {
    const key = 'hook-provide-test'
    const runner = createHookRunner(() => {
      provide(key, 'value')
    })
    runner.run()
    runner.run()
  })

  it('provide overwrites previously provided value (outside component)', () => {
    const key = 'overwrite-test'
    provide(key, 'first')
    expect(inject(key)).toBe('first')
    provide(key, 'second')
    expect(inject(key)).toBe('second')
  })

  // ─── defineComponent ──────────────────────────────────────────────────

  it('defineComponent with setup function returning render fn', () => {
    const Comp = defineComponent({
      name: 'TestComp',
      setup() {
        const count = ref(0)
        return () => h('div', null, String(count.value))
      },
    })

    const el = container()
    const unmount = mount(h(Comp, null), el)
    expect(el.textContent).toBe('0')
    unmount()
  })

  it('defineComponent with setup returning VNode directly', () => {
    const Comp = defineComponent({
      setup() {
        return h('span', null, 'direct')
      },
    })

    const el = container()
    const unmount = mount(h(Comp, null), el)
    expect(el.textContent).toBe('direct')
    unmount()
  })

  it('defineComponent with function shorthand', () => {
    const Comp = defineComponent(() => h('div', null, 'shorthand'))
    const el = container()
    const unmount = mount(h(Comp, null), el)
    expect(el.textContent).toBe('shorthand')
    unmount()
  })

  it('defineComponent with name sets function name', () => {
    const Comp = defineComponent({
      name: 'MyComponent',
      setup() {
        return h('div', null, 'named')
      },
    })
    expect(Comp.name).toBe('MyComponent')
  })

  it('defineComponent without name', () => {
    const Comp = defineComponent({
      setup() {
        return h('div', null, 'unnamed')
      },
    })
    expect(typeof Comp).toBe('function')
  })

  // ─── h / Fragment ─────────────────────────────────────────────────────

  it('h is re-exported', () => {
    expect(typeof h).toBe('function')
    const vnode = h('div', null, 'test')
    expect(vnode.type).toBe('div')
  })

  it('Fragment is re-exported', () => {
    expect(typeof Fragment).toBe('symbol')
  })

  // ─── createApp ────────────────────────────────────────────────────────

  it('createApp().mount mounts to element', () => {
    const Comp = () => h('div', null, 'app')
    const el = container()
    const app = createApp(Comp)
    const unmount = app.mount(el)
    expect(el.textContent).toBe('app')
    unmount()
  })

  it('createApp().mount with string selector', () => {
    const el = container()
    el.id = 'test-app-mount-vue'
    document.body.appendChild(el)

    const Comp = () => h('div', null, 'selector-app')
    const app = createApp(Comp)
    const unmount = app.mount('#test-app-mount-vue')
    expect(el.textContent).toBe('selector-app')
    unmount()
  })

  it('createApp().mount throws for missing selector', () => {
    const Comp = () => h('div', null, 'app')
    const app = createApp(Comp)
    expect(() => app.mount('#nonexistent-element')).toThrow('Cannot find mount target')
  })

  it('createApp with props passes them to component', () => {
    const Comp = ((props: { name: string }) => h('div', null, props.name)) as ComponentFn
    const el = container()
    const app = createApp(Comp, { name: 'world' })
    const unmount = app.mount(el)
    expect(el.textContent).toBe('world')
    unmount()
  })

  it('createApp with no props', () => {
    const Comp = () => h('div', null, 'no-props')
    const el = container()
    const app = createApp(Comp)
    const unmount = app.mount(el)
    expect(el.textContent).toBe('no-props')
    unmount()
  })

  // ─── batch ────────────────────────────────────────────────────────────

  it('batch is re-exported and coalesces updates', () => {
    const count = ref(0)
    const values: number[] = []

    const stop = watchEffect(() => {
      values.push(count.value)
    })

    batch(() => {
      count.value = 1
      count.value = 2
      count.value = 3
    })

    expect(values[0]).toBe(0)
    expect(values[values.length - 1]).toBe(3)
    stop()
  })

  // ─── jsx-runtime ─────────────────────────────────────────────────────

  it('jsx creates DOM element VNodes', () => {
    const vnode = jsx('div', { class: 'test', children: 'hello' })
    expect(vnode.type).toBe('div')
  })

  it('jsxs is same as jsx', () => {
    expect(jsxs).toBe(jsx)
  })

  it('jsxDEV is same as jsx', () => {
    expect(jsxDEV).toBe(jsx)
  })

  it('jsx wraps component functions', () => {
    function MyComp() {
      return h('div', null, 'test')
    }
    const vnode = jsx(MyComp, {})
    expect(vnode.type).not.toBe(MyComp)
    expect(typeof vnode.type).toBe('function')
  })

  it('jsx passes key as prop', () => {
    const vnode = jsx('div', { children: 'test' }, 'my-key')
    expect(vnode.props?.key).toBe('my-key')
  })

  it('getCurrentCtx returns null outside render', () => {
    expect(getCurrentCtx()).toBeNull()
  })

  it('getCurrentCtx returns context during render', () => {
    withHookCtx((c) => {
      expect(getCurrentCtx()).toBe(c)
    })
    expect(getCurrentCtx()).toBeNull()
  })

  // ─── standalone (outside component) ──────────────────────────────────

  it('ref() outside component creates standalone ref', () => {
    const count = ref(0)
    count.value = 10
    expect(count.value).toBe(10)
  })

  it('computed() outside component creates standalone computed', () => {
    const count = ref(5)
    const doubled = computed(() => count.value * 2)
    expect(doubled.value).toBe(10)
    count.value = 7
    expect(doubled.value).toBe(14)
  })

  it('reactive() outside component creates standalone reactive', () => {
    const state = reactive({ x: 1 })
    state.x = 2
    expect(state.x).toBe(2)
  })
})
