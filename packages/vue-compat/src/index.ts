/**
 * @pyreon/vue-compat
 *
 * Vue 3-compatible Composition API that runs on Pyreon's reactive engine,
 * using a hook-indexed re-render model.
 *
 * All stateful APIs (ref, computed, reactive, watch, lifecycle hooks, etc.)
 * use hook-indexing to persist state across re-renders. The component body
 * re-executes when state changes (driven by a version signal in the JSX
 * runtime), and hook-indexed calls return the same objects across renders.
 *
 * DIFFERENCES FROM VUE 3:
 *  - `deep` option in watch() is ignored — Pyreon tracks dependencies automatically.
 *  - `shallowReactive` uses per-property signals (still shallow, but Pyreon-flavored).
 *  - `readonly` returns a Proxy that throws on set (not Vue's readonly proxy).
 *  - `defineComponent` only supports Composition API (setup function), not Options API.
 *  - Components re-execute their body on state change (hook-indexed re-render model).
 *
 * USAGE:
 *   Replace `import { ref, computed, watch } from "vue"` with
 *             `import { ref, computed, watch } from "@pyreon/vue-compat"`
 */

import type { ComponentFn, Props, VNodeChild } from "@pyreon/core"
import {
  createContext,
  Fragment,
  onMount,
  onUnmount,
  onUpdate,
  popContext,
  pushContext,
  h as pyreonH,
  useContext,
} from "@pyreon/core"
import {
  createStore,
  effect,
  computed as pyreonComputed,
  nextTick as pyreonNextTick,
  type Signal,
  signal,
} from "@pyreon/reactivity"
import { mount as pyreonMount } from "@pyreon/runtime-dom"
import { getCurrentCtx, getHookIndex } from "./jsx-runtime"

// ─── Internal symbols ─────────────────────────────────────────────────────────

const V_IS_REF = Symbol("__v_isRef")
const V_IS_READONLY = Symbol("__v_isReadonly")
const V_RAW = Symbol("__v_raw")

// ─── Ref ──────────────────────────────────────────────────────────────────────

export interface Ref<T = unknown> {
  value: T
  readonly [V_IS_REF]: true
}

/**
 * Creates a reactive ref wrapping the given value.
 * Access via `.value` — reads track, writes trigger.
 *
 * Inside a component: hook-indexed. The setter also calls `scheduleRerender()`.
 * Outside a component: creates a standalone reactive ref.
 */
export function ref<T>(value: T): Ref<T> {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as Ref<T>

    const s = signal(value)
    const { scheduleRerender } = ctx
    const r = {
      [V_IS_REF]: true as const,
      get value(): T {
        return s()
      },
      set value(v: T) {
        s.set(v)
        scheduleRerender()
      },
      /** @internal — access underlying signal for triggerRef */
      _signal: s,
      _scheduleRerender: scheduleRerender,
    }
    ctx.hooks[idx] = r
    return r as Ref<T>
  }

  // Outside component
  const s = signal(value)
  const r = {
    [V_IS_REF]: true as const,
    get value(): T {
      return s()
    },
    set value(v: T) {
      s.set(v)
    },
    /** @internal — access underlying signal for triggerRef */
    _signal: s,
  }
  return r as Ref<T>
}

/**
 * Creates a shallow ref — same as `ref()` in Pyreon since signals are inherently shallow.
 */
export function shallowRef<T>(value: T): Ref<T> {
  return ref(value)
}

/**
 * Force trigger a ref's subscribers, even if the value hasn't changed.
 */
export function triggerRef<T>(r: Ref<T>): void {
  const internal = r as Ref<T> & { _signal: Signal<T>; _scheduleRerender?: () => void }
  if (internal._signal) {
    // Force notify by setting the same value with Object.is bypass
    const current = internal._signal.peek()
    internal._signal.set(undefined as T)
    internal._signal.set(current)
  }
  if (internal._scheduleRerender) {
    internal._scheduleRerender()
  }
}

/**
 * Returns `true` if the value is a ref (created by `ref()` or `computed()`).
 */
export function isRef(val: unknown): val is Ref {
  return (
    val !== null && typeof val === "object" && (val as Record<symbol, unknown>)[V_IS_REF] === true
  )
}

/**
 * Unwraps a ref: if it has `.value`, return `.value`; otherwise return as-is.
 */
export function unref<T>(r: T | Ref<T>): T {
  return isRef(r) ? r.value : r
}

// ─── Computed ─────────────────────────────────────────────────────────────────

export interface ComputedRef<T = unknown> extends Ref<T> {
  readonly value: T
}

export interface WritableComputedRef<T = unknown> extends Ref<T> {
  value: T
}

/**
 * Creates a computed ref. Supports both readonly and writable forms.
 *
 * Inside a component: hook-indexed.
 */
export function computed<T>(getter: () => T): ComputedRef<T>
export function computed<T>(options: {
  get: () => T
  set: (value: T) => void
}): WritableComputedRef<T>
export function computed<T>(
  fnOrOptions: (() => T) | { get: () => T; set: (value: T) => void },
): ComputedRef<T> | WritableComputedRef<T> {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as ComputedRef<T>

    const getter = typeof fnOrOptions === "function" ? fnOrOptions : fnOrOptions.get
    const setter = typeof fnOrOptions === "object" ? fnOrOptions.set : undefined
    const c = pyreonComputed(getter)
    const { scheduleRerender } = ctx
    const r = {
      [V_IS_REF]: true as const,
      get value(): T {
        return c()
      },
      set value(v: T) {
        if (!setter) {
          throw new Error("Cannot set value of a computed ref — computed refs are readonly")
        }
        setter(v)
        scheduleRerender()
      },
    }
    ctx.hooks[idx] = r
    return r as ComputedRef<T>
  }

  // Outside component
  const getter = typeof fnOrOptions === "function" ? fnOrOptions : fnOrOptions.get
  const setter = typeof fnOrOptions === "object" ? fnOrOptions.set : undefined
  const c = pyreonComputed(getter)
  const r = {
    [V_IS_REF]: true as const,
    get value(): T {
      return c()
    },
    set value(v: T) {
      if (!setter) {
        throw new Error("Cannot set value of a computed ref — computed refs are readonly")
      }
      setter(v)
    },
  }
  return r as ComputedRef<T>
}

// ─── Reactive / Readonly ──────────────────────────────────────────────────────

// WeakMap to track raw objects behind reactive proxies
const rawMap = new WeakMap<object, object>()

/**
 * Creates a deeply reactive proxy from a plain object.
 * Backed by Pyreon's `createStore()`.
 *
 * Inside a component: hook-indexed. Proxy wrapper intercepts sets to
 * call `scheduleRerender()`.
 */
export function reactive<T extends object>(obj: T): T {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as T

    const proxy = createStore(obj)
    rawMap.set(proxy as object, obj)
    const { scheduleRerender } = ctx
    const wrapped = new Proxy(proxy, {
      set(target, key, value, receiver) {
        const result = Reflect.set(target, key, value, receiver)
        scheduleRerender()
        return result
      },
      deleteProperty(target, key) {
        const result = Reflect.deleteProperty(target, key)
        scheduleRerender()
        return result
      },
    })
    rawMap.set(wrapped as object, obj)
    ctx.hooks[idx] = wrapped
    return wrapped as T
  }

  // Outside component
  const proxy = createStore(obj)
  rawMap.set(proxy as object, obj)
  return proxy
}

/**
 * Creates a shallow reactive proxy — same as `reactive()` in Pyreon.
 */
export function shallowReactive<T extends object>(obj: T): T {
  return reactive(obj)
}

/**
 * Returns a readonly proxy that throws on mutation attempts.
 *
 * Inside a component: hook-indexed.
 */
export function readonly<T extends object>(obj: T): Readonly<T> {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as Readonly<T>

    const proxy = _createReadonlyProxy(obj)
    ctx.hooks[idx] = proxy
    return proxy
  }

  return _createReadonlyProxy(obj)
}

function _createReadonlyProxy<T extends object>(obj: T): Readonly<T> {
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (key === V_IS_READONLY) return true
      if (key === V_RAW) return target
      return Reflect.get(target, key)
    },
    set(_target, key) {
      // Internal symbols used for identification are allowed
      if (key === V_IS_READONLY || key === V_RAW) return true
      throw new Error(`Cannot set property "${String(key)}" on a readonly object`)
    },
    deleteProperty(_target, key) {
      throw new Error(`Cannot delete property "${String(key)}" from a readonly object`)
    },
  })
  return proxy as Readonly<T>
}

/**
 * Returns the raw (unwrapped) object behind a reactive or readonly proxy.
 */
export function toRaw<T extends object>(proxy: T): T {
  // Check readonly first
  const readonlyRaw = (proxy as Record<symbol, unknown>)[V_RAW]
  if (readonlyRaw) return readonlyRaw as T
  // Check reactive
  const raw = rawMap.get(proxy as object)
  return (raw as T) ?? proxy
}

// ─── toRef / toRefs ───────────────────────────────────────────────────────────

/**
 * Creates a ref linked to a property of a reactive object.
 * Reading/writing the ref's `.value` reads/writes the original property.
 *
 * Inside a component: hook-indexed.
 */
export function toRef<T extends object, K extends keyof T>(obj: T, key: K): Ref<T[K]> {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as Ref<T[K]>

    const r = _createToRef(obj, key)
    ctx.hooks[idx] = r
    return r
  }

  return _createToRef(obj, key)
}

function _createToRef<T extends object, K extends keyof T>(obj: T, key: K): Ref<T[K]> {
  const r = {
    [V_IS_REF]: true as const,
    get value(): T[K] {
      return obj[key]
    },
    set value(newValue: T[K]) {
      obj[key] = newValue
    },
  }
  return r as Ref<T[K]>
}

/**
 * Converts all properties of a reactive object into individual refs.
 * Each ref is linked to the original property (not a copy).
 *
 * Inside a component: hook-indexed (the entire result, not individual refs).
 */
export function toRefs<T extends object>(obj: T): { [K in keyof T]: Ref<T[K]> } {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as { [K in keyof T]: Ref<T[K]> }

    const result = {} as { [K in keyof T]: Ref<T[K]> }
    for (const key of Object.keys(obj) as (keyof T)[]) {
      // Create refs directly (not via exported toRef) to avoid extra hook index consumption
      result[key] = _createToRef(obj, key)
    }
    ctx.hooks[idx] = result
    return result
  }

  const result = {} as { [K in keyof T]: Ref<T[K]> }
  for (const key of Object.keys(obj) as (keyof T)[]) {
    result[key] = _createToRef(obj, key)
  }
  return result
}

// ─── Watch ────────────────────────────────────────────────────────────────────

export interface WatchOptions {
  /** Call the callback immediately with current value. Default: false */
  immediate?: boolean
  /** Ignored in Pyreon — dependencies are tracked automatically. */
  deep?: boolean
}

type WatchSource<T> = Ref<T> | (() => T)

/**
 * Watches a reactive source and calls `cb` when it changes.
 *
 * Inside a component: hook-indexed, created once. Disposed on unmount.
 */
export function watch<T>(
  source: WatchSource<T>,
  cb: (newValue: T, oldValue: T | undefined) => void,
  options?: WatchOptions,
): () => void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    const getter = isRef(source) ? () => source.value : (source as () => T)
    let oldValue: T | undefined
    let initialized = false

    if (options?.immediate) {
      oldValue = undefined
      const current = getter()
      cb(current, oldValue)
      oldValue = current
      initialized = true
    }

    let running = false
    const e = effect(() => {
      if (running) return
      running = true
      try {
        const newValue = getter()
        if (initialized) {
          cb(newValue, oldValue)
        }
        oldValue = newValue
        initialized = true
      } finally {
        running = false
      }
    })

    const stop = () => e.dispose()
    ctx.hooks[idx] = stop
    ctx.unmountCallbacks.push(stop)
    return stop
  }

  // Outside component
  const getter = isRef(source) ? () => source.value : (source as () => T)
  let oldValue: T | undefined
  let initialized = false

  if (options?.immediate) {
    oldValue = undefined
    const current = getter()
    cb(current, oldValue)
    oldValue = current
    initialized = true
  }

  let running = false
  const e = effect(() => {
    if (running) return
    running = true
    try {
      const newValue = getter()
      if (initialized) {
        cb(newValue, oldValue)
      }
      oldValue = newValue
      initialized = true
    } finally {
      running = false
    }
  })

  return () => e.dispose()
}

/**
 * Runs the given function reactively — re-executes whenever its tracked
 * dependencies change.
 *
 * Inside a component: hook-indexed, created once. Disposed on unmount.
 */
export function watchEffect(fn: () => void): () => void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    let running = false
    const e = effect(() => {
      if (running) return
      running = true
      try {
        fn()
      } finally {
        running = false
      }
    })
    const stop = () => e.dispose()
    ctx.hooks[idx] = stop
    ctx.unmountCallbacks.push(stop)
    return stop
  }

  let running = false
  const e = effect(() => {
    if (running) return
    running = true
    try {
      fn()
    } finally {
      running = false
    }
  })
  return () => e.dispose()
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Registers a callback to run after the component is mounted.
 * Hook-indexed: only registered on first render.
 */
export function onMounted(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (!ctx) {
    // Fallback: use Pyreon's lifecycle directly (e.g., inside defineComponent without jsx-runtime)
    onMount(() => {
      fn()
      return undefined
    })
    return
  }
  const idx = getHookIndex()
  if (idx < ctx.hooks.length) return // Already registered
  ctx.hooks[idx] = true
  // Schedule to run after render via microtask
  ctx.pendingEffects.push({
    fn: () => {
      fn()
      return undefined
    },
    deps: [],
    cleanup: undefined,
  })
}

/**
 * Registers a callback to run when the component is unmounted.
 * Hook-indexed: only registered on first render.
 */
export function onUnmounted(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (!ctx) {
    onUnmount(fn)
    return
  }
  const idx = getHookIndex()
  if (idx < ctx.hooks.length) return // Already registered
  ctx.hooks[idx] = true
  ctx.unmountCallbacks.push(fn)
}

/**
 * Registers a callback to run after a reactive update (not on initial mount).
 * Hook-indexed: registered once, fires on each re-render.
 */
export function onUpdated(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (!ctx) {
    onUpdate(fn)
    return
  }
  const idx = getHookIndex()
  if (idx >= ctx.hooks.length) {
    // First render — just mark as registered, don't fire
    ctx.hooks[idx] = true
    return
  }
  // Re-render — schedule the callback
  ctx.pendingEffects.push({
    fn: () => {
      fn()
      return undefined
    },
    deps: undefined,
    cleanup: undefined,
  })
}

/**
 * Registers a callback to run before mount.
 * In Pyreon there is no pre-mount phase — maps to `onMounted()`.
 */
export function onBeforeMount(fn: () => void): void {
  onMounted(fn)
}

/**
 * Registers a callback to run before unmount.
 * In Pyreon there is no pre-unmount phase — maps to `onUnmounted()`.
 */
export function onBeforeUnmount(fn: () => void): void {
  onUnmounted(fn)
}

// ─── nextTick ─────────────────────────────────────────────────────────────────

/**
 * Returns a Promise that resolves after all pending reactive updates have flushed.
 */
export function nextTick(): Promise<void> {
  return pyreonNextTick()
}

// ─── Provide / Inject ─────────────────────────────────────────────────────────

// Registry of string/symbol keys to Pyreon context objects (created lazily)
const _contextRegistry = new Map<string | symbol, ReturnType<typeof createContext>>()

function getOrCreateContext<T>(key: string | symbol, defaultValue?: T) {
  if (!_contextRegistry.has(key)) {
    _contextRegistry.set(key, createContext<T>(defaultValue as T))
  }
  return _contextRegistry.get(key) as ReturnType<typeof createContext<T>>
}

/**
 * Provides a value to all descendant components.
 *
 * Inside a component: hook-indexed, pushed once. Popped on unmount.
 */
export function provide<T>(key: string | symbol, value: T): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return // Already provided
    ctx.hooks[idx] = true
    const vueCtx = getOrCreateContext<T>(key)
    pushContext(new Map([[vueCtx.id, value]]))
    ctx.unmountCallbacks.push(() => popContext())
    return
  }
  // Outside component — use Pyreon's provide directly
  const vueCtx = getOrCreateContext<T>(key)
  pushContext(new Map([[vueCtx.id, value]]))
}

/**
 * Injects a value provided by an ancestor component.
 */
export function inject<T>(key: string | symbol, defaultValue?: T): T | undefined {
  const ctx = getOrCreateContext<T>(key)
  const value = useContext(ctx)
  return value !== undefined ? value : defaultValue
}

// ─── defineComponent ──────────────────────────────────────────────────────────

interface ComponentOptions<P extends Props = Props> {
  /** The setup function — called once during component initialization. */
  setup: (props: P) => (() => VNodeChild) | VNodeChild
  /** Optional name for debugging. */
  name?: string
}

/**
 * Defines a component using Vue 3 Composition API style.
 * Only supports the `setup()` function — Options API is not supported.
 */
export function defineComponent<P extends Props = Props>(
  options: ComponentOptions<P> | ((props: P) => VNodeChild),
): ComponentFn<P> {
  if (typeof options === "function") {
    return options as ComponentFn<P>
  }
  const comp = (props: P) => {
    const result = options.setup(props)
    if (typeof result === "function") {
      return (result as () => VNodeChild)()
    }
    return result
  }
  if (options.name) {
    Object.defineProperty(comp, "name", { value: options.name })
  }
  return comp as ComponentFn<P>
}

// ─── h ────────────────────────────────────────────────────────────────────────

/**
 * Re-export of Pyreon's `h()` function for creating VNodes.
 */
export { Fragment, pyreonH as h }

// ─── createApp ────────────────────────────────────────────────────────────────

interface App {
  /** Mount the application into a DOM element. Returns an unmount function. */
  mount(el: string | Element): () => void
}

/**
 * Creates a Pyreon application instance — Vue 3 `createApp()` compatible.
 */
export function createApp(component: ComponentFn, props?: Props): App {
  return {
    mount(el: string | Element): () => void {
      const container = typeof el === "string" ? document.querySelector(el) : el
      if (!container) {
        throw new Error(`Cannot find mount target: ${el}`)
      }
      const vnode = pyreonH(component, props ?? null)
      return pyreonMount(vnode, container)
    },
  }
}

// ─── Additional re-exports ────────────────────────────────────────────────────

export { batch } from "@pyreon/reactivity"
