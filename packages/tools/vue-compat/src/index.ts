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

import type { ComponentFn, Props, VNodeChild } from '@pyreon/core'
import {
  createContext,
  Fragment,
  onMount,
  onUnmount,
  onUpdate,
  popContext,
  Portal,
  pushContext,
  h as pyreonH,
  useContext,
} from '@pyreon/core'
import {
  createStore,
  effect,
  computed as pyreonComputed,
  nextTick as pyreonNextTick,
  type Signal,
  signal,
} from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { getCurrentCtx, getHookIndex } from './jsx-runtime'

// ─── Internal symbols ─────────────────────────────────────────────────────────

const V_IS_REF = Symbol.for('__v_isRef')
const V_IS_READONLY = Symbol('__v_isReadonly')
const V_SKIP = Symbol('__v_skip')
const V_RAW = Symbol('__v_raw')

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
    val !== null && typeof val === 'object' && (val as Record<symbol, unknown>)[V_IS_REF] === true
  )
}

/**
 * Unwraps a ref: if it has `.value`, return `.value`; otherwise return as-is.
 */
export function unref<T>(r: T | Ref<T>): T {
  return isRef(r) ? r.value : r
}

/**
 * Unwraps a ref, calls a getter, or returns the value as-is.
 * Vue 3.3+ API for normalizing ref/getter/value inputs.
 */
export function toValue<T>(source: Ref<T> | (() => T) | T): T {
  if (isRef(source)) return source.value
  if (typeof source === 'function') return (source as () => T)()
  return source
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

    const getter = typeof fnOrOptions === 'function' ? fnOrOptions : fnOrOptions.get
    const setter = typeof fnOrOptions === 'object' ? fnOrOptions.set : undefined
    const c = pyreonComputed(getter)
    const { scheduleRerender } = ctx
    const r = {
      [V_IS_REF]: true as const,
      get value(): T {
        return c()
      },
      set value(v: T) {
        if (!setter) {
          throw new Error('Cannot set value of a computed ref — computed refs are readonly')
        }
        setter(v)
        scheduleRerender()
      },
    }
    ctx.hooks[idx] = r
    return r as ComputedRef<T>
  }

  // Outside component
  const getter = typeof fnOrOptions === 'function' ? fnOrOptions : fnOrOptions.get
  const setter = typeof fnOrOptions === 'object' ? fnOrOptions.set : undefined
  const c = pyreonComputed(getter)
  const r = {
    [V_IS_REF]: true as const,
    get value(): T {
      return c()
    },
    set value(v: T) {
      if (!setter) {
        throw new Error('Cannot set value of a computed ref — computed refs are readonly')
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
  if ((obj as Record<symbol, boolean>)[V_SKIP]) return obj

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

/**
 * Returns a shallow readonly proxy — only top-level properties throw on set.
 * Nested objects are NOT wrapped in readonly (unlike `readonly()`).
 */
export function shallowReadonly<T extends object>(obj: T): Readonly<T> {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as Readonly<T>

    const proxy = _createShallowReadonlyProxy(obj)
    ctx.hooks[idx] = proxy
    return proxy
  }

  return _createShallowReadonlyProxy(obj)
}

function _createShallowReadonlyProxy<T extends object>(obj: T): Readonly<T> {
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (key === V_IS_READONLY) return true
      if (key === V_RAW) return target
      return Reflect.get(target, key)
      // NO recursive wrapping — shallow
    },
    set(_target, key) {
      if (key === V_IS_READONLY || key === V_RAW) return true
      throw new Error(`Cannot set property "${String(key)}" on a readonly object`)
    },
    deleteProperty(_target, key) {
      throw new Error(`Cannot delete property "${String(key)}" from a readonly object`)
    },
  })
  return proxy as Readonly<T>
}

function _createReadonlyProxy<T extends object>(obj: T): Readonly<T> {
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (key === V_IS_READONLY) return true
      if (key === V_RAW) return target
      const value = Reflect.get(target, key)
      // Recursively wrap nested objects in readonly
      if (value !== null && typeof value === 'object' && !isRef(value)) {
        return _createReadonlyProxy(value as object)
      }
      return value
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
  /** Accepted for compatibility but not meaningfully differentiated in Pyreon. */
  flush?: 'pre' | 'post' | 'sync'
}

type WatchSource<T> = Ref<T> | (() => T)

/**
 * Watches a reactive source (or array of sources) and calls `cb` when it changes.
 *
 * Inside a component: hook-indexed, created once. Disposed on unmount.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function watch<T>(
  source: WatchSource<T>,
  cb: (newValue: T, oldValue: T | undefined, onCleanup: (fn: () => void) => void) => void,
  options?: WatchOptions,
): () => void
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function watch<T extends readonly WatchSource<any>[]>(
  sources: [...T],
  cb: (
    newValues: { [K in keyof T]: T[K] extends WatchSource<infer V> ? V : never },
    oldValues: { [K in keyof T]: T[K] extends WatchSource<infer V> ? V | undefined : never },
    onCleanup: (fn: () => void) => void,
  ) => void,
  options?: WatchOptions,
): () => void
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function watch<T>(
  source: WatchSource<T> | WatchSource<T>[],
  cb: (newValue: T, oldValue: T | undefined, onCleanup: (fn: () => void) => void) => void,
  options?: WatchOptions,
): () => void {
  // Array of sources — multi-watch
  if (Array.isArray(source)) {
    return _watchArray(
      source as WatchSource<unknown>[],
      cb as (newValue: unknown, oldValue: unknown) => void,
      options,
    )
  }
  return _watchSingle(source as WatchSource<T>, cb, options)
}

function _watchArray(
  sources: WatchSource<unknown>[],
  cb: (newValues: unknown, oldValues: unknown, onCleanup: (fn: () => void) => void) => void,
  options?: WatchOptions,
): () => void {
  const getters = sources.map((s) => (isRef(s) ? () => (s as Ref).value : (s as () => unknown)))

  let cleanupFn: (() => void) | undefined
  const onCleanup = (fn: () => void) => {
    cleanupFn = fn
  }

  const runCleanup = () => {
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = undefined
    }
  }

  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    let oldValues: unknown[] | undefined
    let initialized = false

    if (options?.immediate) {
      const current = getters.map((g) => g())
      cb(current, getters.map(() => undefined), onCleanup)
      oldValues = current
      initialized = true
    }

    let running = false
    const combined = pyreonComputed(() => getters.map((g) => g()))
    const e = effect(() => {
      if (running) return
      running = true
      try {
        const newValues = combined()
        if (initialized) {
          runCleanup()
          cb([...newValues], oldValues ? [...oldValues] : getters.map(() => undefined), onCleanup)
        }
        oldValues = [...newValues]
        initialized = true
      } finally {
        running = false
      }
    })

    const stop = () => {
      runCleanup()
      e.dispose()
    }
    ctx.hooks[idx] = stop
    ctx.unmountCallbacks.push(stop)
    return stop
  }

  // Outside component
  let oldValues: unknown[] | undefined
  let initialized = false

  if (options?.immediate) {
    const current = getters.map((g) => g())
    cb(current, getters.map(() => undefined), onCleanup)
    oldValues = current
    initialized = true
  }

  let running = false
  const combined = pyreonComputed(() => getters.map((g) => g()))
  const e = effect(() => {
    if (running) return
    running = true
    try {
      const newValues = combined()
      if (initialized) {
        runCleanup()
        cb([...newValues], oldValues ? [...oldValues] : getters.map(() => undefined), onCleanup)
      }
      oldValues = [...newValues]
      initialized = true
    } finally {
      running = false
    }
  })

  const stop = () => {
    runCleanup()
    e.dispose()
  }
  if (_currentEffectScope) {
    ;(
      _currentEffectScope as EffectScopeCompat & { _cleanups: (() => void)[] }
    )._cleanups.push(stop)
  }
  return stop
}

function _watchSingle<T>(
  source: WatchSource<T>,
  cb: (newValue: T, oldValue: T | undefined, onCleanup: (fn: () => void) => void) => void,
  options?: WatchOptions,
): () => void {
  let cleanupFn: (() => void) | undefined
  const onCleanup = (fn: () => void) => {
    cleanupFn = fn
  }

  const runCleanup = () => {
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = undefined
    }
  }

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
      cb(current, oldValue, onCleanup)
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
          runCleanup()
          cb(newValue, oldValue, onCleanup)
        }
        oldValue = newValue
        initialized = true
      } finally {
        running = false
      }
    })

    const stop = () => {
      runCleanup()
      e.dispose()
    }
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
    cb(current, oldValue, onCleanup)
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
        runCleanup()
        cb(newValue, oldValue, onCleanup)
      }
      oldValue = newValue
      initialized = true
    } finally {
      running = false
    }
  })

  const stop = () => {
    runCleanup()
    e.dispose()
  }
  if (_currentEffectScope) {
    ;(
      _currentEffectScope as EffectScopeCompat & { _cleanups: (() => void)[] }
    )._cleanups.push(stop)
  }
  return stop
}

/**
 * Runs the given function reactively — re-executes whenever its tracked
 * dependencies change. Passes an `onCleanup` registration function to the
 * callback, matching Vue 3's `watchEffect((onCleanup) => { ... })` API.
 *
 * Inside a component: hook-indexed, created once. Disposed on unmount.
 */
export function watchEffect(
  fn: (onCleanup: (fn: () => void) => void) => void,
): () => void {
  const ctx = getCurrentCtx()

  let cleanupFn: (() => void) | undefined
  const onCleanup = (cleanup: () => void) => {
    cleanupFn = cleanup
  }

  const runEffect = () => {
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = undefined
    }
    fn(onCleanup)
  }

  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    let running = false
    const e = effect(() => {
      if (running) return
      running = true
      try {
        runEffect()
      } finally {
        running = false
      }
    })
    const stop = () => {
      if (cleanupFn) cleanupFn()
      e.dispose()
    }
    ctx.hooks[idx] = stop
    ctx.unmountCallbacks.push(stop)
    return stop
  }

  let running = false
  const e = effect(() => {
    if (running) return
    running = true
    try {
      runEffect()
    } finally {
      running = false
    }
  })
  const stop = () => {
    if (cleanupFn) cleanupFn()
    e.dispose()
  }
  // Register with current effect scope if one is active
  if (_currentEffectScope) {
    ;(
      _currentEffectScope as EffectScopeCompat & { _cleanups: (() => void)[] }
    )._cleanups.push(stop)
  }
  return stop
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
 * Supports Vue 3's factory default pattern: `inject(key, () => expensiveDefault, true)`.
 */
export function inject<T>(
  key: string | symbol,
  defaultValue?: T | (() => T),
  treatDefaultAsFactory?: boolean,
): T | undefined {
  const ctx = getOrCreateContext<T>(key)
  const value = useContext(ctx)
  if (value !== undefined) return value
  if (defaultValue === undefined) return undefined
  if (treatDefaultAsFactory && typeof defaultValue === 'function') {
    return (defaultValue as () => T)()
  }
  return defaultValue as T
}

// ─── defineComponent ──────────────────────────────────────────────────────────

interface ComponentOptions<P extends Props = Props> {
  /** The setup function — called once during component initialization. */
  setup: (props: P, ctx?: SetupContext) => (() => VNodeChild) | VNodeChild
  /** Optional name for debugging. */
  name?: string
  /** Prop definitions (not validated at runtime, used for type documentation). */
  props?: Record<string, unknown>
}

/**
 * Defines a component using Vue 3 Composition API style.
 * Only supports the `setup()` function — Options API is not supported.
 */
export function defineComponent<P extends Props = Props>(
  options: ComponentOptions<P> | ((props: P) => VNodeChild),
): ComponentFn<P> {
  if (typeof options === 'function') {
    return options as ComponentFn<P>
  }
  const comp = (props: P) => {
    // Extract children from props for slots
    const children = (props as Record<string, unknown>).children as VNodeChild | undefined
    // Create a minimal SetupContext
    const setupCtx: SetupContext = {
      emit: (event: string, ...args: unknown[]) => {
        const handlerKey = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
        const handler = (props as Record<string, unknown>)[handlerKey]
        if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...args)
      },
      slots: {
        default: children !== undefined ? (() => children) : undefined,
      } as Record<string, (() => VNodeChild) | undefined>,
      attrs: props as Record<string, unknown>,
    }
    const result = options.setup(props, setupCtx)
    if (typeof result === 'function') {
      return (result as () => VNodeChild)()
    }
    return result
  }
  if (options.name) {
    Object.defineProperty(comp, 'name', { value: options.name })
  }
  return comp as ComponentFn<P>
}

// ─── defineAsyncComponent ───────────────────────────────────────────────────

/**
 * Defines an async component that lazily loads on first use.
 * Supports both a bare loader function and an options object with
 * loadingComponent, errorComponent, delay, and timeout.
 *
 * Returns a ComponentFn with a `__loading` property for Suspense integration.
 */
export function defineAsyncComponent<P extends Props = Props>(
  loader:
    | (() => Promise<{ default: ComponentFn<P> }>)
    | {
        loader: () => Promise<{ default: ComponentFn<P> }>
        loadingComponent?: ComponentFn
        errorComponent?: ComponentFn
        delay?: number
        timeout?: number
      },
): ComponentFn<P> & { __loading: () => boolean } {
  const load = typeof loader === 'function' ? loader : loader.loader

  const loaded = signal<ComponentFn<P> | null>(null)
  const error = signal<Error | null>(null)
  let promise: Promise<unknown> | null = null

  const startLoad = () => {
    if (promise) return
    promise = load().then(
      (mod) => loaded.set(mod.default),
      (err) => error.set(err instanceof Error ? err : new Error(String(err))),
    )
  }

  const AsyncComp = ((props: P) => {
    startLoad()
    const err = error()
    if (err) throw err
    const comp = loaded()
    if (!comp) return null
    return comp(props)
  }) as ComponentFn<P> & { __loading: () => boolean }

  AsyncComp.__loading = () => {
    const isLoading = loaded() === null && error() === null
    if (isLoading) startLoad()
    return isLoading
  }

  return AsyncComp
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
  /** Install a plugin. */
  use(plugin: { install: (app: App) => void }): App
  /** Provide a value to the entire app tree. */
  provide<T>(key: string | symbol, value: T): App
}

/**
 * Creates a Pyreon application instance — Vue 3 `createApp()` compatible.
 */
export function createApp(component: ComponentFn, props?: Props): App {
  const provisions: Array<{ key: string | symbol; value: unknown }> = []

  const app: App = {
    mount(el: string | Element): () => void {
      const container = typeof el === 'string' ? document.querySelector(el) : el
      if (!container) {
        throw new Error(`Cannot find mount target: ${el}`)
      }
      // Push app-level provisions before mounting
      for (const { key, value } of provisions) {
        const ctx = getOrCreateContext(key)
        pushContext(new Map([[ctx.id, value]]))
      }
      const vnode = pyreonH(component, props ?? null)
      return pyreonMount(vnode, container)
    },
    use(plugin: { install: (app: App) => void }): App {
      plugin.install(app)
      return app
    },
    provide<T>(key: string | symbol, value: T): App {
      provisions.push({ key, value })
      return app
    },
  }

  return app
}

// ─── isReactive / isReadonly / isProxy / markRaw ─────────────────────────────

/**
 * Returns `true` if the value was created by `reactive()`.
 */
export function isReactive(value: unknown): boolean {
  return value !== null && typeof value === 'object' && rawMap.has(value as object)
}

/**
 * Returns `true` if the value was created by `readonly()`.
 */
export function isReadonly(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[V_IS_READONLY] === true
  )
}

/**
 * Returns `true` if the value is either reactive or readonly.
 */
export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

/**
 * Marks an object so that `reactive()` will return it as-is (not wrapped).
 */
export function markRaw<T extends object>(obj: T): T {
  ;(obj as Record<symbol, boolean>)[V_SKIP] = true
  return obj
}

// ─── effectScope / getCurrentScope / onScopeDispose ──────────────────────────

export interface EffectScopeCompat {
  /** Run a function within this scope. Returns undefined if scope is stopped. */
  run<T>(fn: () => T): T | undefined
  /** Stop the scope and dispose all collected effects/cleanups. */
  stop(): void
  /** Whether the scope is still active. */
  active: boolean
}

let _currentEffectScope: EffectScopeCompat | null = null

/**
 * Creates an effect scope that collects reactive effects for grouped disposal.
 *
 * @param detached - If true, the scope is not collected by a parent scope.
 */
export function effectScope(detached?: boolean): EffectScopeCompat {
  const cleanups: (() => void)[] = []
  let active = true

  const scope: EffectScopeCompat = {
    get active() {
      return active
    },
    run<T>(fn: () => T): T | undefined {
      if (!active) return undefined
      const prev = _currentEffectScope
      _currentEffectScope = scope
      try {
        return fn()
      } finally {
        _currentEffectScope = prev
      }
    },
    stop() {
      if (!active) return
      active = false
      for (const fn of cleanups) fn()
      cleanups.length = 0
    },
  }

  // Auto-collect in parent scope unless detached
  if (!detached && _currentEffectScope) {
    const parentCleanups = (_currentEffectScope as EffectScopeCompat & { _cleanups?: (() => void)[] })
      ._cleanups
    if (parentCleanups) parentCleanups.push(() => scope.stop())
  }
  ;(scope as EffectScopeCompat & { _cleanups: (() => void)[] })._cleanups = cleanups

  return scope
}

/**
 * Returns the current active effect scope, or undefined if none.
 */
export function getCurrentScope(): EffectScopeCompat | undefined {
  return _currentEffectScope ?? undefined
}

/**
 * Registers a cleanup function on the current effect scope.
 */
export function onScopeDispose(fn: () => void): void {
  if (_currentEffectScope) {
    ;(
      _currentEffectScope as EffectScopeCompat & { _cleanups: (() => void)[] }
    )._cleanups.push(fn)
  }
}

// ─── onErrorCaptured / onRenderTracked / onRenderTriggered ───────────────────

/**
 * Registers an error capture handler.
 * No direct equivalent in Pyreon — stored but not actively used.
 */
export function onErrorCaptured(fn: (err: Error) => boolean | void): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return
    ctx.hooks[idx] = fn
  }
}

/**
 * Dev-only lifecycle hook — no-op in Pyreon.
 */
export function onRenderTracked(
  _fn: (event: { key: string; type: string }) => void,
): void {
  // Dev-only hook — no equivalent in Pyreon
}

/**
 * Dev-only lifecycle hook — no-op in Pyreon.
 */
export function onRenderTriggered(
  _fn: (event: { key: string; type: string }) => void,
): void {
  // Dev-only hook — no equivalent in Pyreon
}

// ─── Teleport / KeepAlive ────────────────────────────────────────────────────

/**
 * Teleport — renders children into a different DOM element.
 * Maps to Pyreon's Portal.
 */
export function Teleport(props: {
  to: string | Element
  children?: VNodeChild
}): VNodeChild {
  const target =
    typeof props.to === 'string' ? document.querySelector(props.to) : props.to
  if (!target) return props.children ?? null
  return Portal({ target, children: props.children ?? null })
}

/**
 * KeepAlive — not supported in Pyreon. Renders children as-is.
 */
export function KeepAlive(props: { children?: VNodeChild }): VNodeChild {
  return props.children ?? null
}

// ─── watchPostEffect / watchSyncEffect ───────────────────────────────────────

/**
 * Runs a watchEffect that flushes after DOM updates.
 * In Pyreon, same as `watchEffect()`.
 */
export function watchPostEffect(
  fn: (onCleanup: (fn: () => void) => void) => void,
): () => void {
  return watchEffect(fn)
}

/**
 * Runs a watchEffect that flushes synchronously.
 * In Pyreon, same as `watchEffect()`.
 */
export function watchSyncEffect(
  fn: (onCleanup: (fn: () => void) => void) => void,
): () => void {
  return watchEffect(fn)
}

// ─── customRef ───────────────────────────────────────────────────────────────

/**
 * Creates a customized ref with explicit control over dependency tracking
 * and update triggering.
 */
export function customRef<T>(
  factory: (
    track: () => void,
    trigger: () => void,
  ) => { get: () => T; set: (v: T) => void },
): Ref<T> {
  const s = signal(0)
  const { get, set } = factory(
    () => { s(); return undefined as never }, // track — reading the signal subscribes
    () => s.set(s.peek() + 1), // trigger — bump version to re-notify
  )
  return {
    [V_IS_REF]: true as const,
    get value(): T {
      return get()
    },
    set value(v: T) {
      set(v)
    },
  } as Ref<T>
}

// ─── version ─────────────────────────────────────────────────────────────────

/**
 * Compatibility version string — indicates Vue 3 API compatibility.
 */
export const version = '3.5.0-pyreon'

// ─── Type exports ────────────────────────────────────────────────────────────

export type { ComponentFn as Component } from '@pyreon/core'
export type { VNodeChild as VNode } from '@pyreon/core'

/** Vue-compatible PropType — a callable that returns T. */
export type PropType<T> = { (): T }

/** Extract prop types from a component's props definition. */
export type ExtractPropTypes<T> = {
  [K in keyof T]: T[K] extends PropType<infer V> ? V : T[K]
}

/** Vue-compatible emits options type. */
export type EmitsOptions = Record<string, (...args: unknown[]) => void>

/** Vue-compatible setup context. */
export type SetupContext = {
  emit: (event: string, ...args: unknown[]) => void
  slots: Record<string, (() => VNodeChild) | undefined>
  attrs: Record<string, unknown>
}

/** Vue-compatible plugin interface. */
export type Plugin = { install: (app: App) => void }

/** Vue-compatible directive type (stub). */
export type Directive = Record<string, unknown>

/** Vue-compatible injection key with type branding. */
export type InjectionKey<T> = symbol & { __type: T }

// ─── Additional re-exports ────────────────────────────────────────────────────

export { batch } from '@pyreon/reactivity'
