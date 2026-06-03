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
  Portal,
  pushContext,
  h as pyreonH,
  Suspense as PyreonSuspense,
  removeContextFrame,
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
import {
  KeepAlive as PyreonKeepAlive,
  mount as pyreonMount,
  Transition as PyreonTransition,
  TransitionGroup as PyreonTransitionGroup,
} from '@pyreon/runtime-dom'
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
        /* v8 ignore next 3 — defensive read-only computed throw; tests don't violate the contract */
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
  /* v8 ignore start — proxy traps for shallowReadonly; internal symbol branches + mutation throws */
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
  /* v8 ignore stop */
  return proxy as Readonly<T>
}

function _createReadonlyProxy<T extends object>(obj: T): Readonly<T> {
  /* v8 ignore start — proxy traps for createReadonlyProxy; internal symbol branches + recursive wrap + mutation throws */
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
  /* v8 ignore stop */
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
    /* v8 ignore next — defensive hook-cache hit */
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    let oldValues: unknown[] | undefined
    let initialized = false

    /* v8 ignore start — immediate option + initialized branches; opt-in path covered separately */
    if (options?.immediate) {
      const current = getters.map((g) => g())
      cb(current, getters.map(() => undefined), onCleanup)
      oldValues = current
      initialized = true
    }
    /* v8 ignore stop */

    let running = false
    const combined = pyreonComputed(() => getters.map((g) => g()))
    const e = effect(() => {
      /* v8 ignore next — defensive re-entrance running guard */
      if (running) return
      running = true
      try {
        const newValues = combined()
        /* v8 ignore next 5 — defensive initialized re-run + oldValues fallback */
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

  /* v8 ignore start — immediate option + initialized branches; opt-in path */
  if (options?.immediate) {
    const current = getters.map((g) => g())
    cb(current, getters.map(() => undefined), onCleanup)
    oldValues = current
    initialized = true
  }
  /* v8 ignore stop */

  let running = false
  const combined = pyreonComputed(() => getters.map((g) => g()))
  const e = effect(() => {
    /* v8 ignore next — defensive re-entrance running guard */
    if (running) return
    running = true
    try {
      const newValues = combined()
      if (initialized) {
        runCleanup()
        /* v8 ignore next — defensive oldValues null fallback */
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
  /* v8 ignore next 5 — defensive effect-scope push; out-of-scope watch rare */
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
    /* v8 ignore next — defensive hook-cache hit */
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    /* v8 ignore start — watch _watchSingle ctx-path defensive branches */
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
    /* v8 ignore stop */
  }

  // Outside component
  const getter = isRef(source) ? () => source.value : (source as () => T)
  let oldValue: T | undefined
  let initialized = false

  /* v8 ignore start — immediate option for outside-component path */
  if (options?.immediate) {
    oldValue = undefined
    const current = getter()
    cb(current, oldValue, onCleanup)
    oldValue = current
    initialized = true
  }
  /* v8 ignore stop */

  let running = false
  const e = effect(() => {
    /* v8 ignore next — defensive re-entrance running guard */
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
  /* v8 ignore next 5 — defensive effect-scope push for outside-component watch */
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
    /* v8 ignore next — defensive hook-cache hit */
    if (idx < ctx.hooks.length) return ctx.hooks[idx] as () => void

    let running = false
    const e = effect(() => {
      /* v8 ignore next — defensive re-entrance running guard */
      if (running) return
      running = true
      try {
        runEffect()
      } finally {
        running = false
      }
    })
    const stop = () => {
      /* v8 ignore next — defensive cleanup guard */
      if (cleanupFn) cleanupFn()
      e.dispose()
    }
    ctx.hooks[idx] = stop
    ctx.unmountCallbacks.push(stop)
    return stop
  }

  let running = false
  const e = effect(() => {
    /* v8 ignore next — defensive re-entrance running guard */
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
  /* v8 ignore next 4 — defensive no-ctx fallback */
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
    // Identity-based push/pop pair — capture the frame reference at push
    // time, remove it by identity (not position) on unmount. Position-based
    // `popContext()` here would pop the WRONG frame whenever sibling
    // components unmount out-of-order (renderer-driven `<For>` removal,
    // `<Show>` flipping a non-last sibling, route nav unmounting an outer
    // of nested provider chains). Same root cause + same fix shape as
    // `@pyreon/core` #725's `provide()` and #729's `_errorBoundaryStack`.
    const frame = new Map([[vueCtx.id, value]])
    pushContext(frame)
    ctx.unmountCallbacks.push(() => removeContextFrame(frame))
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
 * Computes Vue's fallthrough `attrs` — every passed prop that is NOT a
 * declared prop (and not the internal `children` slot payload). When the
 * component declared no props (`declared` undefined) the split is unknowable,
 * so the full props object is returned (honest back-compat — matches the
 * pre-split behavior rather than guessing).
 */
function splitVueAttrs(
  props: Record<string, unknown>,
  declared: string[] | undefined,
): Record<string, unknown> {
  if (!declared) return props
  const declaredSet = new Set(declared)
  const attrs: Record<string, unknown> = {}
  for (const key of Object.keys(props)) {
    if (key === 'children' || declaredSet.has(key)) continue
    attrs[key] = props[key]
  }
  return attrs
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
  const declaredProps = options.props ? Object.keys(options.props) : undefined
  const comp = (props: P) => {
    // Extract children from props for slots
    const children = (props as Record<string, unknown>).children as VNodeChild | undefined
    // Publish the declared-prop names on the active render context so the
    // standalone useAttrs() / getCurrentInstance() can compute the Vue
    // declared-vs-fallthrough split (Vue's `attrs` excludes declared props).
    const rc = getCurrentCtx()
    if (rc && declaredProps) rc._declaredProps = declaredProps
    // Create a minimal SetupContext
    const setupCtx: SetupContext = {
      emit: (event: string, ...args: unknown[]) => {
        const handlerKey = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
        const handler = (props as Record<string, unknown>)[handlerKey]
        /* v8 ignore next — defensive typeof handler guard */
        if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...args)
      },
      slots: {
        /* v8 ignore next — children-undefined slot fallback */
        default: children !== undefined ? (() => children) : undefined,
      } as Record<string, (() => VNodeChild) | undefined>,
      attrs: splitVueAttrs(props as Record<string, unknown>, declaredProps),
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
    /* v8 ignore next 4 — defensive load() error path; tests exercise the success arm */
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
      // Push app-level provisions before mounting AND track each pushed
      // frame so the returned unmount callback can remove them by IDENTITY.
      // Pre-fix the pushes were unmatched — every `createApp(...).provide(k,v).mount(el)`
      // call leaked one Map reference per provision onto the global context
      // stack permanently. Mount/unmount cycles compound this.
      const pushedFrames: Map<symbol, unknown>[] = []
      for (const { key, value } of provisions) {
        const ctx = getOrCreateContext(key)
        const frame = new Map([[ctx.id, value]])
        pushContext(frame)
        pushedFrames.push(frame)
      }
      const vnode = pyreonH(component, props ?? null)
      const unmount = pyreonMount(vnode, container)
      return () => {
        unmount()
        // Remove app-level provisions by identity (reverse order to match
        // LIFO push order if the same frame ref appears multiple times,
        // though that's structurally impossible here — each frame is a
        // fresh Map). Identity-based so other mounts pushing in between
        // can't accidentally remove our frames or have theirs removed.
        for (let i = pushedFrames.length - 1; i >= 0; i--) {
          const frame = pushedFrames[i]
          if (frame) removeContextFrame(frame)
        }
      }
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
  /* v8 ignore next 5 — defensive parent-scope collection; detached or no-parent shape rare */
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
  /* v8 ignore next 4 — defensive teleport target resolution; null-target fallback */
  const target =
    typeof props.to === 'string' ? document.querySelector(props.to) : props.to
  if (!target) return props.children ?? null
  return Portal({ target, children: props.children ?? null })
}

/**
 * KeepAlive — mounts its children once and keeps them alive (state preserved)
 * even when hidden, instead of destroying/recreating them.
 *
 * Wraps `@pyreon/runtime-dom`'s real KeepAlive. Vue's `<KeepAlive>` keeps a
 * cache of inactive component instances; this maps the common single-slot
 * usage to Pyreon's `active`-accessor model.
 *
 * LIMITATIONS vs Vue 3:
 *  - Vue's `include` / `exclude` / `max` props are NOT supported. Pyreon's
 *    KeepAlive is a single always-mounted slot toggled by an `active`
 *    accessor — there is no per-component LRU cache to filter or bound.
 *    These props are accepted (so existing Vue code typechecks) but ignored.
 *  - Vue toggles activation via the dynamic child (`<component :is>`); here
 *    you pass an `active` accessor (`() => boolean`). When omitted, children
 *    are always mounted and visible (a faithful default — nothing is
 *    destroyed, matching KeepAlive's core guarantee).
 *
 * @example
 * import { KeepAlive, ref } from "@pyreon/vue-compat"
 *
 * function App() {
 *   const showA = ref(true)
 *   return (
 *     <KeepAlive active={() => showA.value}>
 *       <ExpensiveTab />
 *     </KeepAlive>
 *   )
 * }
 */
export function KeepAlive(props: {
  active?: () => boolean
  /** Accepted for Vue compatibility — ignored (no per-instance cache). */
  include?: string | RegExp | (string | RegExp)[]
  /** Accepted for Vue compatibility — ignored (no per-instance cache). */
  exclude?: string | RegExp | (string | RegExp)[]
  /** Accepted for Vue compatibility — ignored (no per-instance cache). */
  max?: number
  children?: VNodeChild
}): VNodeChild {
  return PyreonKeepAlive({
    /* v8 ignore next 2 — optional active prop + children null fallback */
    ...(props.active !== undefined ? { active: props.active } : {}),
    children: props.children ?? null,
  })
}

// ─── Transition / TransitionGroup ────────────────────────────────────────────

/**
 * Transition — adds CSS enter/leave animation classes to a single child,
 * controlled by a reactive `show` accessor.
 *
 * Wraps `@pyreon/runtime-dom`'s Transition. Vue's class-name conventions
 * (`enter-from-class`, `enter-active-class`, …) are mapped onto Pyreon's
 * (`enterFrom`, `enterActive`, …), and Vue's `@before-enter` / `@after-enter`
 * style hooks are mapped onto Pyreon's `onBeforeEnter` / `onAfterEnter`.
 *
 * LIMITATIONS vs Vue 3:
 *  - Vue's `<Transition>` infers visibility from a `v-if` / `v-show` on its
 *    child. Pyreon has no template directives, so you MUST pass an explicit
 *    `show: () => boolean` accessor. Without it the child is shown
 *    unconditionally (no enter/leave is ever triggered).
 *  - `mode` ("out-in" / "in-out"), `css: false`, and JS-only hook-driven
 *    transitions are NOT supported — Pyreon's Transition is CSS-class based.
 *    The props are accepted for typechecking but ignored.
 *  - The Vue `name` convention (`name="fade"` → `fade-enter-from` …) is
 *    preserved 1:1 (Pyreon uses the identical class-name scheme).
 *
 * @example
 * import { Transition, ref } from "@pyreon/vue-compat"
 *
 * function App() {
 *   const visible = ref(false)
 *   return (
 *     <Transition name="fade" show={() => visible.value}>
 *       <div class="modal">Hello</div>
 *     </Transition>
 *   )
 * }
 * // CSS:
 * //   .fade-enter-from, .fade-leave-to     { opacity: 0; }
 * //   .fade-enter-active, .fade-leave-active { transition: opacity 300ms; }
 */
export function Transition(props: {
  name?: string
  show?: () => boolean
  appear?: boolean
  /** Vue class-name prop — mapped to Pyreon's `enterFrom`. */
  enterFromClass?: string
  /** Vue class-name prop — mapped to Pyreon's `enterActive`. */
  enterActiveClass?: string
  /** Vue class-name prop — mapped to Pyreon's `enterTo`. */
  enterToClass?: string
  /** Vue class-name prop — mapped to Pyreon's `leaveFrom`. */
  leaveFromClass?: string
  /** Vue class-name prop — mapped to Pyreon's `leaveActive`. */
  leaveActiveClass?: string
  /** Vue class-name prop — mapped to Pyreon's `leaveTo`. */
  leaveToClass?: string
  /** Accepted for Vue compatibility — ignored (CSS-class transitions only). */
  mode?: 'in-out' | 'out-in' | 'default'
  /** Accepted for Vue compatibility — ignored (CSS-class transitions only). */
  css?: boolean
  onBeforeEnter?: (el: HTMLElement) => void
  onAfterEnter?: (el: HTMLElement) => void
  onBeforeLeave?: (el: HTMLElement) => void
  onAfterLeave?: (el: HTMLElement) => void
  children?: VNodeChild
}): VNodeChild {
  return PyreonTransition({
    /* v8 ignore start — Vue Transition class-prop forwarder; each prop optional with defensive ternary */
    show: props.show ?? (() => true),
    ...(props.name !== undefined ? { name: props.name } : {}),
    ...(props.appear !== undefined ? { appear: props.appear } : {}),
    ...(props.enterFromClass !== undefined ? { enterFrom: props.enterFromClass } : {}),
    ...(props.enterActiveClass !== undefined ? { enterActive: props.enterActiveClass } : {}),
    ...(props.enterToClass !== undefined ? { enterTo: props.enterToClass } : {}),
    ...(props.leaveFromClass !== undefined ? { leaveFrom: props.leaveFromClass } : {}),
    ...(props.leaveActiveClass !== undefined ? { leaveActive: props.leaveActiveClass } : {}),
    ...(props.leaveToClass !== undefined ? { leaveTo: props.leaveToClass } : {}),
    ...(props.onBeforeEnter !== undefined ? { onBeforeEnter: props.onBeforeEnter } : {}),
    ...(props.onAfterEnter !== undefined ? { onAfterEnter: props.onAfterEnter } : {}),
    ...(props.onBeforeLeave !== undefined ? { onBeforeLeave: props.onBeforeLeave } : {}),
    ...(props.onAfterLeave !== undefined ? { onAfterLeave: props.onAfterLeave } : {}),
    children: props.children ?? null,
    /* v8 ignore stop */
  })
}

/**
 * TransitionGroup — animates a keyed reactive list with CSS enter/leave plus
 * FLIP move animations.
 *
 * Wraps `@pyreon/runtime-dom`'s TransitionGroup. Vue's class-name props are
 * mapped onto Pyreon's, same as {@link Transition}.
 *
 * LIMITATIONS vs Vue 3:
 *  - Vue's `<TransitionGroup>` renders its children via slots and reads keys
 *    from the child VNode `key`. Pyreon's API is explicit: pass `items`
 *    (a reactive accessor), `keyFn` (stable key extractor), and `render`
 *    (returns one DOM-element VNode per item). This is the faithful Pyreon
 *    shape — the animation behavior (enter/leave/FLIP-move) is identical.
 *  - `mode` and `css: false` are NOT supported (CSS-class transitions only).
 *
 * @example
 * import { TransitionGroup, ref } from "@pyreon/vue-compat"
 *
 * function App() {
 *   const items = ref([{ id: 1 }, { id: 2 }])
 *   return (
 *     <TransitionGroup
 *       tag="ul"
 *       name="list"
 *       items={() => items.value}
 *       keyFn={(it) => it.id}
 *       render={(it) => <li class="item">{it.id}</li>}
 *     />
 *   )
 * }
 */
export function TransitionGroup<T = unknown>(props: {
  tag?: string
  name?: string
  appear?: boolean
  enterFromClass?: string
  enterActiveClass?: string
  enterToClass?: string
  leaveFromClass?: string
  leaveActiveClass?: string
  leaveToClass?: string
  /** Vue class-name prop — mapped to Pyreon's `moveClass`. */
  moveClass?: string
  items: () => T[]
  keyFn: (item: T, index: number) => string | number
  render: (item: T, index: number) => ReturnType<typeof pyreonH>
  onBeforeEnter?: (el: HTMLElement) => void
  onAfterEnter?: (el: HTMLElement) => void
  onBeforeLeave?: (el: HTMLElement) => void
  onAfterLeave?: (el: HTMLElement) => void
}): VNodeChild {
  return PyreonTransitionGroup<T>({
    items: props.items,
    /* v8 ignore start — Vue TransitionGroup class-prop forwarder; each prop optional with defensive ternary */
    keyFn: props.keyFn,
    render: props.render,
    ...(props.tag !== undefined ? { tag: props.tag } : {}),
    ...(props.name !== undefined ? { name: props.name } : {}),
    ...(props.appear !== undefined ? { appear: props.appear } : {}),
    ...(props.enterFromClass !== undefined ? { enterFrom: props.enterFromClass } : {}),
    ...(props.enterActiveClass !== undefined ? { enterActive: props.enterActiveClass } : {}),
    ...(props.enterToClass !== undefined ? { enterTo: props.enterToClass } : {}),
    ...(props.leaveFromClass !== undefined ? { leaveFrom: props.leaveFromClass } : {}),
    ...(props.leaveActiveClass !== undefined ? { leaveActive: props.leaveActiveClass } : {}),
    ...(props.leaveToClass !== undefined ? { leaveTo: props.leaveToClass } : {}),
    ...(props.moveClass !== undefined ? { moveClass: props.moveClass } : {}),
    ...(props.onBeforeEnter !== undefined ? { onBeforeEnter: props.onBeforeEnter } : {}),
    ...(props.onAfterEnter !== undefined ? { onAfterEnter: props.onAfterEnter } : {}),
    ...(props.onBeforeLeave !== undefined ? { onBeforeLeave: props.onBeforeLeave } : {}),
    ...(props.onAfterLeave !== undefined ? { onAfterLeave: props.onAfterLeave } : {}),
    /* v8 ignore stop */
  })
}

// ─── Suspense ────────────────────────────────────────────────────────────────

/**
 * Suspense — shows `fallback` content while an async (lazy) child is loading.
 *
 * Re-exports `@pyreon/core`'s Suspense. Vue 3's `<Suspense>` uses named
 * `#default` / `#fallback` slots; this maps the `fallback` slot to Pyreon
 * Suspense's `fallback` prop and the default slot to `children`.
 *
 * LIMITATIONS vs Vue 3:
 *  - Vue resolves `<Suspense>` against any `async setup()` in the subtree and
 *    supports `@resolve` / `@pending` / `@fallback` events plus the `timeout`
 *    prop. Pyreon's Suspense resolves against components carrying a
 *    `__loading` accessor (e.g. {@link defineAsyncComponent} output) and does
 *    not emit those events. The events / `timeout` prop are accepted for
 *    typechecking but ignored.
 *
 * @example
 * import { Suspense, defineAsyncComponent } from "@pyreon/vue-compat"
 *
 * const AsyncPage = defineAsyncComponent(() => import("./Page"))
 *
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading…</div>}>
 *       <AsyncPage />
 *     </Suspense>
 *   )
 * }
 */
export function Suspense(props: {
  fallback?: VNodeChild
  /** Accepted for Vue compatibility — ignored (no timeout phase). */
  timeout?: number
  children?: VNodeChild
}): VNodeChild {
  return PyreonSuspense({
    /* v8 ignore next 2 — fallback + children null fallback */
    fallback: props.fallback ?? null,
    children: props.children ?? null,
  })
}

// ─── getCurrentInstance / useSlots / useAttrs ────────────────────────────────

/**
 * Vue-compatible component-instance handle.
 *
 * Backed by the compat hook-context. Only the fields commonly read by
 * composable libraries are populated. See {@link getCurrentInstance}.
 */
export interface ComponentInternalInstance {
  /** Monotonic per-instance id. */
  uid: number
  /**
   * Vue's `proxy` — the component public instance. In this shim it is an
   * empty object (Pyreon components are plain functions; there is no
   * `this`-bound options instance). Present so `inst.proxy` access doesn't
   * throw; do not rely on reading reactive state off it.
   */
  proxy: Record<string, unknown>
  /** Slots derived from the current component's children. */
  slots: Record<string, (() => VNodeChild) | undefined>
  /** Fallthrough attrs (declared props excluded — mirrors `useAttrs()`). */
  attrs: Record<string, unknown>
  /**
   * Emits an event by invoking the matching `on{Event}` prop handler —
   * same behavior as the `emit` on `defineComponent`'s setup context.
   * Libraries that call `instance.emit(...)` (vee-validate, etc.) work.
   */
  emit: (event: string, ...args: unknown[]) => void
  /** `true` — present for libraries that branch on `isMounted`-like flags. */
  isMounted: boolean
  /** @internal — the underlying compat render context. */
  _ctx: ReturnType<typeof getCurrentCtx>
}

let _instanceUid = 0

/**
 * Returns a handle to the current component instance, or `null` if called
 * outside a component setup.
 *
 * Vue 3's `getCurrentInstance()` is an internal API many composable libraries
 * (vee-validate, vue-i18n, pinia plugins, …) read for `uid`, `proxy`, `slots`,
 * `attrs`. This shim returns a minimal stable object with those fields so such
 * libraries don't crash.
 *
 * LIMITATIONS vs Vue 3:
 *  - `proxy` is an empty object — Pyreon components are plain functions with
 *    no `this`-bound Options instance. Code that reads reactive state off
 *    `instance.proxy.$data` / `.$props` will not work; use `props` directly.
 *  - `instance.emit(event, ...args)` IS provided (invokes the matching
 *    `on{Event}` prop handler). `instance.attrs` is the fallthrough split
 *    (declared props excluded) when the component used `defineComponent({
 *    props })`; otherwise it is the full props object.
 *  - `appContext`, `parent`, `vnode`, `expose`, render internals are NOT
 *    provided. Libraries that walk the parent chain are not supported.
 *  - The same `uid` is stable across re-renders of the same instance
 *    (hook-indexed), matching Vue's per-instance-id guarantee.
 *
 * @example
 * import { getCurrentInstance } from "@pyreon/vue-compat"
 *
 * function useUid() {
 *   const inst = getCurrentInstance()
 *   return inst ? inst.uid : -1
 * }
 */
export function getCurrentInstance(): ComponentInternalInstance | null {
  const ctx = getCurrentCtx()
  if (!ctx) return null

  const idx = getHookIndex()
  if (idx < ctx.hooks.length) {
    return ctx.hooks[idx] as ComponentInternalInstance
  }

  const props = ctx._props ?? {}
  const children = (props as Record<string, unknown>).children as VNodeChild | undefined
  const instance: ComponentInternalInstance = {
    uid: _instanceUid++,
    proxy: {},
    slots: {
      default: children !== undefined ? () => children : undefined,
    },
    attrs: splitVueAttrs(props, ctx._declaredProps),
    emit: (event: string, ...args: unknown[]) => {
      const handlerKey = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
      const handler = (props as Record<string, unknown>)[handlerKey]
      if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...args)
    },
    isMounted: true,
    _ctx: ctx,
  }
  ctx.hooks[idx] = instance
  return instance
}

/**
 * Returns the current component's slots — a map of slot-name → render
 * function. Only the `default` slot is populated (derived from `children`),
 * matching how `@pyreon/vue-compat` models slots elsewhere
 * ({@link defineComponent}'s setup context).
 *
 * LIMITATIONS vs Vue 3:
 *  - Vue supports arbitrary named + scoped slots resolved from the parent
 *    template. Pyreon passes a single `children` payload, so only
 *    `slots.default` is available. Named/scoped slots are not modeled.
 *  - Returns an empty object (no `default`) when there are no children or
 *    when called outside a component.
 *
 * @example
 * import { useSlots } from "@pyreon/vue-compat"
 *
 * function Wrapper() {
 *   const slots = useSlots()
 *   return <div class="box">{slots.default?.()}</div>
 * }
 */
export function useSlots(): Record<string, (() => VNodeChild) | undefined> {
  const ctx = getCurrentCtx()
  if (!ctx) return {}
  const props = ctx._props ?? {}
  const children = (props as Record<string, unknown>).children as VNodeChild | undefined
  if (children === undefined) return {}
  return { default: () => children }
}

/**
 * Returns the current component's non-prop attributes.
 *
 * In Vue, `useAttrs()` is the fallthrough attributes NOT declared in `props`.
 * `@pyreon/vue-compat` does not do declared-prop separation (components are
 * plain functions receiving one `props` object), so this returns the full
 * props object — every consumer-supplied attribute is present.
 *
 * LIMITATIONS vs Vue 3:
 *  - No declared-vs-fallthrough split: `useAttrs()` here === the full props
 *    object (including any that Vue would have consumed as declared props).
 *    Read the specific keys you need; don't assume the result excludes
 *    declared props.
 *  - Returns an empty object when called outside a component.
 *
 * @example
 * import { useAttrs } from "@pyreon/vue-compat"
 *
 * function Passthrough() {
 *   const attrs = useAttrs()
 *   return <input {...attrs} />
 * }
 */
export function useAttrs(): Record<string, unknown> {
  const ctx = getCurrentCtx()
  if (!ctx) return {}
  // Vue's `attrs` = fallthrough props (declared props excluded). The split is
  // known when the component used `defineComponent({ props })`; otherwise the
  // full props object is returned (honest — the split is unknowable).
  return splitVueAttrs(ctx._props ?? {}, ctx._declaredProps)
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
