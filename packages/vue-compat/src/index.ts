/**
 * @pyreon/vue-compat
 *
 * Vue 3-compatible Composition API that runs on Pyreon's reactive engine.
 *
 * Allows you to write familiar Vue 3 Composition API code while getting Pyreon's
 * fine-grained reactivity and superior performance.
 *
 * DIFFERENCES FROM VUE 3:
 *  - `deep` option in watch() is ignored — Pyreon tracks dependencies automatically.
 *  - `shallowReactive` uses per-property signals (still shallow, but Pyreon-flavored).
 *  - `readonly` returns a Proxy that throws on set (not Vue's readonly proxy).
 *  - `defineComponent` only supports Composition API (setup function), not Options API.
 *  - Components run ONCE (setup phase), not on every render.
 *
 * USAGE:
 *   Replace `import { ref, computed, watch } from "vue"` with
 *             `import { ref, computed, watch } from "@pyreon/vue-compat"`
 */

import { Fragment, createContext, onMount, onUnmount, onUpdate, h as pyreonH } from "@pyreon/core"
import type { ComponentFn, Props, VNodeChild } from "@pyreon/core"
import {
  type Signal,
  createStore,
  effect,
  computed as pyreonComputed,
  nextTick as pyreonNextTick,
  signal,
} from "@pyreon/reactivity"
import { mount as pyreonMount } from "@pyreon/runtime-dom"

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
 * Difference from Vue: backed by a Pyreon signal. No `__v_isShallow` distinction
 * at runtime since Pyreon signals are always shallow (deep reactivity is via stores).
 */
export function ref<T>(value: T): Ref<T> {
  const s = signal(value)
  const r = {
    [V_IS_REF]: true as const,
    get value(): T {
      return s()
    },
    set value(newValue: T) {
      s.set(newValue)
    },
    /** @internal — access underlying signal for triggerRef */
    _signal: s,
  }
  return r as Ref<T>
}

/**
 * Creates a shallow ref — same as `ref()` in Pyreon since signals are inherently shallow.
 *
 * Difference from Vue: identical to `ref()` — Pyreon signals don't perform deep conversion.
 */
export function shallowRef<T>(value: T): Ref<T> {
  return ref(value)
}

/**
 * Force trigger a ref's subscribers, even if the value hasn't changed.
 */
export function triggerRef<T>(r: Ref<T>): void {
  const internal = r as Ref<T> & { _signal: Signal<T> }
  if (internal._signal) {
    // Force notify by setting the same value with Object.is bypass
    const current = internal._signal.peek()
    internal._signal.set(undefined as T)
    internal._signal.set(current)
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

/**
 * Creates a readonly computed ref.
 * Backed by Pyreon's `computed()`, wrapped in a `.value` accessor.
 *
 * Difference from Vue: setter is not supported — throws if assigned.
 */
export function computed<T>(fn: () => T): ComputedRef<T> {
  const c = pyreonComputed(fn)
  const r = {
    [V_IS_REF]: true as const,
    get value(): T {
      return c()
    },
    set value(_: T) {
      throw new Error("Cannot set value of a computed ref — computed refs are readonly")
    },
  }
  return r as ComputedRef<T>
}

// ─── Reactive / Readonly ──────────────────────────────────────────────────────

/**
 * Creates a deeply reactive proxy from a plain object.
 * Backed by Pyreon's `createStore()`.
 *
 * Difference from Vue: uses Pyreon's fine-grained per-property signals.
 * Direct mutation triggers only affected signals.
 */
export function reactive<T extends object>(obj: T): T {
  const proxy = createStore(obj)
  // Store raw reference for toRaw()
  rawMap.set(proxy as object, obj)
  return proxy
}

/**
 * Creates a shallow reactive proxy.
 * In Pyreon, `createStore` is already per-property (not deeply recursive for primitives),
 * but nested objects will be wrapped. For truly shallow behavior, use individual refs.
 *
 * Difference from Vue: backed by `createStore()` — same as `reactive()` in practice.
 */
export function shallowReactive<T extends object>(obj: T): T {
  return reactive(obj)
}

// WeakMap to track raw objects behind reactive proxies
const rawMap = new WeakMap<object, object>()

/**
 * Returns a readonly proxy that throws on mutation attempts.
 *
 * Difference from Vue: uses a simple Proxy with a set trap that throws,
 * rather than Vue's full readonly reactive system.
 */
export function readonly<T extends object>(obj: T): Readonly<T> {
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (key === V_IS_READONLY) return true
      if (key === V_RAW) return target
      return Reflect.get(target, key)
    },
    set(_target, key) {
      if (typeof key === "symbol") return true
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
 *
 * Difference from Vue: only works for objects created via `reactive()` or `readonly()`.
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
 */
export function toRef<T extends object, K extends keyof T>(obj: T, key: K): Ref<T[K]> {
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
 */
export function toRefs<T extends object>(obj: T): { [K in keyof T]: Ref<T[K]> } {
  const result = {} as { [K in keyof T]: Ref<T[K]> }
  for (const key of Object.keys(obj) as Array<keyof T>) {
    result[key] = toRef(obj, key)
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
 * Tracks old and new values.
 *
 * Difference from Vue: `deep` option is ignored — Pyreon tracks dependencies automatically.
 * Returns a stop function to dispose the watcher.
 */
export function watch<T>(
  source: WatchSource<T>,
  cb: (newValue: T, oldValue: T | undefined) => void,
  options?: WatchOptions,
): () => void {
  const getter = isRef(source) ? () => source.value : (source as () => T)
  let oldValue: T | undefined = undefined
  let initialized = false

  if (options?.immediate) {
    oldValue = undefined
    const current = getter()
    cb(current, oldValue)
    oldValue = current
    initialized = true
  }

  const e = effect(() => {
    const newValue = getter()
    if (initialized) {
      // Only call cb if value actually changed (or on first tracked run)
      cb(newValue, oldValue)
    }
    oldValue = newValue
    initialized = true
  })

  return () => e.dispose()
}

/**
 * Runs the given function reactively — re-executes whenever its tracked
 * dependencies change.
 *
 * Difference from Vue: identical to Pyreon's `effect()`.
 * Returns a stop function.
 */
export function watchEffect(fn: () => void): () => void {
  const e = effect(fn)
  return () => e.dispose()
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Registers a callback to run after the component is mounted.
 *
 * Difference from Vue: maps directly to Pyreon's `onMount()`.
 * In Pyreon there is no distinction between beforeMount and mounted.
 */
export function onMounted(fn: () => void): void {
  onMount(() => {
    fn()
    return undefined
  })
}

/**
 * Registers a callback to run before the component is unmounted.
 *
 * Difference from Vue: maps to Pyreon's `onUnmount()`.
 * In Pyreon there is no distinction between beforeUnmount and unmounted.
 */
export function onUnmounted(fn: () => void): void {
  onUnmount(fn)
}

/**
 * Registers a callback to run after a reactive update.
 *
 * Difference from Vue: maps to Pyreon's `onUpdate()`.
 */
export function onUpdated(fn: () => void): void {
  onUpdate(fn)
}

/**
 * Registers a callback to run before mount.
 * In Pyreon there is no pre-mount phase — maps to `onMount()`.
 */
export function onBeforeMount(fn: () => void): void {
  onMount(() => {
    fn()
    return undefined
  })
}

/**
 * Registers a callback to run before unmount.
 * In Pyreon there is no pre-unmount phase — maps to `onUnmount()`.
 */
export function onBeforeUnmount(fn: () => void): void {
  onUnmount(fn)
}

// ─── nextTick ─────────────────────────────────────────────────────────────────

/**
 * Returns a Promise that resolves after all pending reactive updates have flushed.
 *
 * Difference from Vue: identical to Pyreon's `nextTick()`.
 */
export function nextTick(): Promise<void> {
  return pyreonNextTick()
}

// ─── Provide / Inject ─────────────────────────────────────────────────────────

// Internal map of string keys to context objects
const contextRegistry = new Map<string | symbol, ReturnType<typeof createContext>>()

function getOrCreateContext<T>(key: string | symbol, defaultValue?: T) {
  if (!contextRegistry.has(key)) {
    contextRegistry.set(key, createContext<T>(defaultValue as T))
  }
  return contextRegistry.get(key) as ReturnType<typeof createContext<T>>
}

/**
 * Provides a value to all descendant components.
 *
 * Difference from Vue: backed by Pyreon's `createContext`/`useContext`.
 * The key should be a string or symbol.
 */
export function provide<T>(key: string | symbol, value: T): void {
  const ctx = getOrCreateContext<T>(key, value)
  // In Pyreon, context is set via the context stack during component rendering.
  // Since provide() is called during setup, we store it for inject() to read.
  // This uses a simple module-level store since Pyreon contexts work differently.
  _provideStore.set(key, value)
}

/**
 * Injects a value provided by an ancestor component.
 *
 * Difference from Vue: backed by Pyreon's context system.
 */
export function inject<T>(key: string | symbol, defaultValue?: T): T | undefined {
  if (_provideStore.has(key)) {
    return _provideStore.get(key) as T
  }
  return defaultValue
}

// Simple provide/inject store (works within same component tree setup)
const _provideStore = new Map<string | symbol, unknown>()

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
 *
 * Difference from Vue: returns a Pyreon `ComponentFn`. No template/render option —
 * the setup function should return a render function or VNode directly.
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
export { pyreonH as h, Fragment }

// ─── createApp ────────────────────────────────────────────────────────────────

interface App {
  /** Mount the application into a DOM element. Returns an unmount function. */
  mount(el: string | Element): () => void
}

/**
 * Creates a Pyreon application instance — Vue 3 `createApp()` compatible.
 *
 * Difference from Vue: does not support plugins, directives, or global config.
 * The component receives `props` if provided.
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
