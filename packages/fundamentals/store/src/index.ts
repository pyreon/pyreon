/**
 * @pyreon/store — global state management built on @pyreon/reactivity signals.
 *
 * API (composition style):
 *
 *   const useCounter = defineStore("counter", () => {
 *     const count = signal(0)
 *     const double = computed(() => count() * 2)
 *     const increment = () => count.update(n => n + 1)
 *     return { count, double, increment }
 *   })
 *
 *   // Inside a component (or anywhere):
 *   const { store, patch, subscribe } = useCounter()
 *   store.count()       // read state
 *   store.increment()   // call action
 *   patch({ count: 5 }) // batch-update
 *
 * Stores are GLOBAL SINGLETONS — `defineStore(id, setup)` returns a hook
 * that ALWAYS resolves the same instance regardless of where it's called
 * from. The setup function runs once per store id; subsequent calls return
 * the same `StoreApi`.
 *
 * **⚠ When you DON'T want a singleton:**
 *
 * For per-Provider-instance state (the React Context pattern), use the
 * Pyreon-native shape with plain `signal()` + `createContext` instead of
 * defineStore:
 *
 * ```ts
 * // ✓ Per-instance — each <FooProvider> mount creates a fresh signal
 * const FooCtx = createContext<{ count: Signal<number> } | null>(null)
 *
 * function FooProvider(props: { children: VNodeChild }) {
 *   const count = signal(0)
 *   provide(FooCtx, { count })
 *   return props.children
 * }
 * ```
 *
 * The defineStore singleton model is the right fit for app-global state
 * (auth, settings, theme), NOT for per-component-tree state where two
 * mounts of the same provider must hold independent state.
 *
 * Call `resetStore(id)` or `resetAllStores()` to clear the registry
 * (useful for testing or HMR).
 *
 * For concurrent SSR, call setStoreRegistryProvider() with an
 * AsyncLocalStorage-backed provider so each request gets isolated store state.
 */

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import {
  _resumeSoleSubscriber,
  _resumeSubscriber,
  _suspendSoleSubscriber,
  _suspendSubscriber,
  batch,
  type Computed,
  effectScope,
  type EffectScope,
  registerSingleton,
  signal as createSignal,
  type Signal,
} from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/store
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)


// Dev-time counter sink — see packages/internals/perf-harness for contract.
// Globalthis sink (no @pyreon/perf-harness import) so this file stays
// publishable without a dev-only dep, and the counter strings + guard
// tree-shake out at consumer build time.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export type { Signal } from '@pyreon/reactivity'
export { batch, computed, effect, signal } from '@pyreon/reactivity'

import {
  extractParseFn,
  formatIssues,
  type InferSchema,
  type SchemaIssue,
} from '@pyreon/validation'

export { setRegistryProvider as setStoreRegistryProvider } from './registry'
export {
  __clearStoreHydrationForTesting,
  dehydrateStores,
  hydrateStores,
} from './hydration'

import { _notifyChange } from './devtools'
import { getRegistry } from './registry'
import { consumeHydration, markStoreSsrExcluded } from './hydration'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MutationInfo {
  storeId: string
  type: 'direct' | 'patch'
  events: { key: string; newValue: unknown; oldValue: unknown }[]
}

export type SubscribeCallback = (mutation: MutationInfo, state: Record<string, unknown>) => void

export interface ActionContext {
  name: string
  storeId: string
  args: unknown[]
  after: (cb: (result: unknown) => void) => void
  onError: (cb: (error: unknown) => void) => void
}

export type OnActionCallback = (context: ActionContext) => void

/**
 * Global store plugin. Runs once per store at first creation. May return a
 * cleanup function — it runs when that store's `dispose()` is called (for
 * tearing down external resources the plugin attached: sync loops, timers,
 * server connections). Reactive primitives (`effect`/`computed`) created
 * inside a plugin body are owned by the store's scope and disposed
 * automatically — no cleanup needed for those.
 */
export type StorePlugin = (api: StoreApi<Record<string, unknown>>) => void | (() => void)

/** The structured result returned by every store hook. */
export interface StoreApi<T> {
  /** The user-defined store state, computeds, and actions. */
  store: T
  /** Store identifier. */
  id: string
  /** Read-only snapshot of all signal values. */
  readonly state: Record<string, unknown>
  /** Batch-update multiple signals (object form) or direct access (function form). */
  patch(partialState: Record<string, unknown>): void
  patch(fn: (state: Record<string, any>) => void): void
  /** Subscribe to state mutations. Returns an unsubscribe function. */
  subscribe(callback: SubscribeCallback, options?: { immediate?: boolean }): () => void
  /** Intercept action calls. Returns an unsubscribe function. */
  onAction(callback: OnActionCallback): () => void
  /** Reset all signals to their initial values. */
  reset(): void
  /** Teardown: unsubscribe all listeners and remove from registry. */
  dispose(): void
}

// ─── Detection helpers ───────────────────────────────────────────────────────

/** Duck-typed signal interface for detection without importing concrete types. */
interface SignalLike {
  (): unknown
  set(v: unknown): void
  peek(): unknown
  subscribe(l: () => void): () => void
}

function isSignalLike(v: unknown): v is SignalLike {
  if (typeof v !== 'function') return false
  const fn = v as unknown as Record<string, unknown>
  return typeof fn.set === 'function' && typeof fn.peek === 'function'
}

// ─── Plugin system ───────────────────────────────────────────────────────────

const _plugins: StorePlugin[] = []

/**
 * Register a global store plugin. Plugins run when a store is first created.
 * Returns a function that unregisters THIS registration (idempotent) — stores
 * already created keep whatever the plugin attached; later stores skip it.
 *
 * @example
 * const remove = addStorePlugin((api) => api.subscribe(log))
 * remove() // e.g. in a test's afterEach, or on HMR dispose
 */
export function addStorePlugin(plugin: StorePlugin): () => void {
  // Wrap so each registration has its own identity: removing one registration
  // of a plugin added twice removes exactly that one (identity-based removal,
  // never position-based — leak class A).
  const entry: StorePlugin = (api) => plugin(api)
  _plugins.push(entry)
  return () => {
    const i = _plugins.indexOf(entry)
    if (i !== -1) _plugins.splice(i, 1)
  }
}

/** Per-store options for the setup-function form of `defineStore`. */
export interface StoreOptions {
  /**
   * Include this store in the SSR state payload (`window.__PYREON_STORE_STATE__`)
   * and seed it from that payload on the client. Default `true`.
   *
   * Set `false` for anything that must never reach the HTML — a session,
   * an auth token, per-user server-only data. Every store in the request
   * registry is otherwise serialized into the page. An `ssr: false` store
   * also ignores any incoming server snapshot, so a client-only store always
   * starts from its own `setup()` values.
   */
  readonly ssr?: boolean
}

// ─── Schema-driven store types (Tier A.1 + A.2) ──────────────────────────────

// Schema-detection types + helpers live in `@pyreon/validation`. We
// re-export the public types so consumers of `@pyreon/store` don't have
// to add a second import line. Same shape, identical semantics.
export type { InferSchema, SchemaIssue, SchemaParseResult } from '@pyreon/validation'

/**
 * Map a parsed-output type to a record of per-field signals — what the
 * setup function sees as `state` and what's exposed at the top level of
 * the resulting `StoreApi.store`.
 */
export type SignalsOf<T> = {
  readonly [K in keyof T]: Signal<T[K]>
}

/**
 * Context object passed to the schema-mode `setup` function. Provides
 * the per-field signals + validated mutation methods + reset.
 */
export interface SchemaStoreContext<T extends Record<string, unknown>> {
  /** Per-field signals — `state.fieldName` is `Signal<FieldType>`. */
  readonly state: SignalsOf<T>
  /** Replace the whole state. Validates the input via schema; throws on failure. */
  readonly set: (next: T) => void
  /** Partial merge. Validates the merged result via schema; throws on failure. */
  readonly patch: (partial: Partial<T>) => void
  /** Re-validate `initial` via schema and write to all signals. */
  readonly reset: () => void
}

/**
 * Schema-driven store config. Accepts ANY of: Pyreon's `TypedSchemaAdapter`
 * (from `@pyreon/validation`), or a Standard Schema-compliant schema, or
 * a user-authored adapter conforming to either shape.
 */
export interface SchemaStoreConfig<S, U extends Record<string, unknown> = Record<string, unknown>> {
  /** The schema. Pyreon adapter or Standard Schema instance. */
  readonly schema: S
  /** Initial state. Validated once at `defineStore`-time (fail-fast). */
  readonly initial: InferSchema<S>
  /**
   * Optional setup function — receives per-field signals + mutation
   * helpers + reset. Returns user actions / computeds that merge into
   * `StoreApi.store` alongside the auto-generated field signals.
   */
  readonly setup?: (ctx: SchemaStoreContext<InferSchema<S>>) => U
  /**
   * Custom validation-error handler. Called instead of throwing when set.
   * Receives the schema issues + which operation failed.
   */
  readonly onValidationError?: (issues: SchemaIssue[], op: 'set' | 'patch' | 'init') => void
  /** Include this store in the SSR state payload. Default `true` — see `StoreOptions.ssr`. */
  readonly ssr?: boolean
}

/**
 * Recursive partial — every property optional at every depth. Arrays
 * and class instances replace (not merge), only plain objects deep-merge.
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<unknown>
    ? T
    : T extends object
      ? { readonly [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * `StoreApi` extended with schema-mode mutation methods — strictly typed
 * from the schema. Two type params:
 *
 * - `TRaw` = the schema's inferred field VALUES (`InferSchema<S>`). Drives
 *   `set` / `patch` / `deepPatch` / `update` / `state` — so every mutation
 *   is checked against the real field types at compile time (a wrong-typed
 *   value, an unknown field, or an `update` on a non-field key all fail
 *   typecheck), with zero manual annotations.
 * - `TStore` = the shape exposed at `.store` — the per-field `Signal`s
 *   (`SignalsOf<TRaw>`) merged with any actions/computeds the `setup`
 *   function returns. Defaults to `SignalsOf<TRaw>` when there's no setup.
 *
 * `state`/`patch` are re-declared (not inherited) because the base
 * `StoreApi` types them loosely as `Record<string, unknown>`.
 */
export interface SchemaStoreApi<
  TRaw extends Record<string, unknown>,
  TStore extends Record<string, unknown> = SignalsOf<TRaw>,
> extends Omit<StoreApi<TStore>, 'state' | 'patch'> {
  /** Read-only snapshot of the validated field VALUES (schema-typed). */
  readonly state: TRaw
  /** Replace the whole state. Validates input via schema; throws on failure. */
  set(next: TRaw): void
  /** Shallow per-field merge. Validates the merged result; throws on failure. */
  patch(partial: Partial<TRaw>): void
  /**
   * Functional escape hatch — direct signal access, NOT schema-validated.
   * Use the object form (`patch(partial)`) for validated writes.
   */
  patch(fn: (state: TStore) => void): void
  /**
   * Deep-merge a partial state. Nested plain objects merge recursively;
   * arrays / class instances / primitives REPLACE. Validates the merged
   * result via schema; throws on failure. Use this when you want to
   * update a nested field without spreading the parent — e.g.
   * `deepPatch({ prefs: { theme: 'dark' } })` preserves other `prefs` keys.
   * For a shallow per-field replace, use `patch`.
   */
  deepPatch(partial: DeepPartial<TRaw>): void
  /**
   * Transform a single top-level field via a callback. The current value
   * is passed to the transformer; the return value replaces it (after
   * validating the resulting merged state). Useful for array filter /
   * append, object key delete / add, primitive math — one call covers all
   * remove / add / transform patterns.
   *
   * `key` is constrained to the schema FIELD names (not setup-returned
   * actions/computeds), and the transformer receives + returns the field's
   * exact type `TRaw[K]` — no casts needed.
   *
   * @example
   * ```ts
   * u.update('items', items => items.filter(x => x.id !== id))
   * u.update('items', items => [...items, newItem])
   * u.update('prefs', prefs => ({ ...prefs, theme: 'dark' }))
   * u.update('count', n => n + 1)
   * ```
   */
  update<K extends keyof TRaw & string>(
    key: K,
    transformer: (current: TRaw[K]) => TRaw[K],
  ): void
}

// ─── Inference helpers (type-only, zero runtime bytes) ──────────────────────

/**
 * Fields of a store shape that are plain FUNCTIONS (actions) — signals and
 * computeds excluded. Internal building block for {@link StoreActions}.
 */
type FunctionFieldsOf<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown
    ? T[K] extends Signal<unknown>
      ? never
      : T[K] extends Computed<unknown>
        ? never
        : K
    : never]: T[K]
}

/**
 * Derive the UNWRAPPED per-field value shape of a store — the inverse of
 * {@link SignalsOf}. Accepts the api object of BOTH store flavors:
 *
 * - `SchemaStoreApi<TRaw, TStore>` → `TRaw` (the schema-inferred field values)
 * - `StoreApi<T>` (composition stores) → the signal fields of `T`, each
 *   unwrapped to its value type. Computeds and actions are EXCLUDED —
 *   mirroring the runtime `api.state` snapshot, which only captures
 *   signal-like fields (a computed has no `set`, an action is a function).
 *
 * @example
 * ```ts
 * const useCart = defineStore('cart', () => {
 *   const items = signal<string[]>([])
 *   const count = computed(() => items().length)
 *   const add = (item: string) => items.update((xs) => [...xs, item])
 *   return { items, count, add }
 * })
 * type CartState = StoreState<ReturnType<typeof useCart>>
 * // → { items: string[] }  (count/add excluded — not snapshot state)
 * ```
 */
export type StoreState<Api> =
  Api extends SchemaStoreApi<infer TRaw, infer _TStore>
    ? TRaw
    : Api extends StoreApi<infer T>
      ? { [K in keyof T as T[K] extends Signal<unknown> ? K : never]: SignalValueOf<T[K]> }
      : never

/** Unwrap `Signal<V>` → `V` (local helper — see `SignalValue` in `@pyreon/reactivity`). */
type SignalValueOf<S> = S extends Signal<infer V> ? V : never

/**
 * Derive the ACTIONS (plain function fields) of a store — signals and
 * computeds excluded. Accepts the api object of both store flavors:
 *
 * - `StoreApi<T>` (composition stores) → function fields of `T`.
 * - `SchemaStoreApi<TRaw, TStore>` → function fields of `TStore` (the
 *   setup-returned actions; the auto-generated field signals drop out).
 *
 * @example
 * ```ts
 * type CartActions = StoreActions<ReturnType<typeof useCart>>
 * // → { add: (item: string) => void }
 * ```
 */
export type StoreActions<Api> =
  Api extends SchemaStoreApi<infer _TRaw, infer TStore>
    ? FunctionFieldsOf<TStore>
    : Api extends StoreApi<infer T>
      ? FunctionFieldsOf<T>
      : never

// ─── Schema dispatch helpers ─────────────────────────────────────────────────

/**
 * Reserved keys on `StoreApi` itself — schema fields cannot shadow these
 * because the auto-generated field signals are placed on `api.store`
 * alongside user actions. Collision would silently overwrite framework
 * methods. Throw at `defineStore`-time with a clear message instead.
 */
const RESERVED_STORE_KEYS = new Set([
  // StoreApi top-level methods (would be a real collision on the api object,
  // not on api.store — but enforcing one consistent rule is simpler)
  'set',
])

// Schema-detection helpers (extractParseFn, wrapStandardSchema,
// isPyreonAdapter, isStandardSchema, formatIssues) live in
// `@pyreon/validation` — same shape, shared by both `@pyreon/store`
// and `@pyreon/state-tree` schema modes. Imported above.

/**
 * Detect a plain object (literal `{}` or `Object.create(null)`) — used by
 * `deepMerge` to decide whether to recurse or replace. Arrays, class
 * instances, Maps, Sets, Dates, Promises etc. are NOT plain objects and
 * REPLACE rather than merge.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Recursively merge `source` into `target` for plain-object branches.
 * Returns a NEW object — never mutates inputs. Used by `deepPatch`.
 *
 * - Plain object × plain object → recurse
 * - Anything else (array, class instance, primitive, null, undefined) →
 *   `source` value wins (replace semantics). Matches Vue 3 `reactive` /
 *   Lodash `_.merge` (without array-index merging) — the convention
 *   schema-store users expect for "deep-update this nested thing."
 */
function deepMerge(target: unknown, source: unknown): unknown {
  // Defensive guard for direct/recursive misuse — unreachable via deepPatch
  // (the top-level call always passes two plain objects, and the recursion
  // below only descends when BOTH sides are plain).
  /* v8 ignore next */
  if (!isPlainObject(target) || !isPlainObject(source)) return source
  const out: Record<string, unknown> = { ...target }
  for (const key of Object.keys(source)) {
    out[key] =
      isPlainObject(target[key]) && isPlainObject(source[key])
        ? deepMerge(target[key], source[key])
        : source[key]
  }
  return out
}

// ─── defineStore ─────────────────────────────────────────────────────────────

/**
 * Schema-driven store overload. Accepts a `TypedSchemaAdapter` (from
 * `@pyreon/validation`) or a Standard Schema-compliant schema, plus an
 * `initial` state and an optional `setup` function. Returns a hook whose
 * `StoreApi.store` exposes per-field signals at the top level alongside
 * any actions/computeds returned by `setup`.
 *
 * All field types are inferred from the schema — zero manual annotations.
 * `set` and `patch` validate every write through the schema; direct
 * signal writes (`store.field.set(v)`) bypass validation by design
 * (documented escape hatch for hot paths).
 *
 * @example
 * ```ts
 * import { zodSchema } from '@pyreon/validation'
 * import { defineStore } from '@pyreon/store'
 * import { z } from 'zod'
 *
 * const useUser = defineStore('user', {
 *   schema: zodSchema(z.object({ name: z.string(), age: z.number() })),
 *   initial: { name: '', age: 0 },
 *   setup: ({ state }) => ({
 *     greet: computed(() => `Hi, ${state.name()}`),
 *   }),
 * })
 *
 * const u = useUser()
 * u.store.name()         // Signal<string> read
 * u.store.greet()        // Computed
 * u.set({ name: 'Alice', age: 30 })  // validates + replaces
 * u.patch({ age: 31 })   // validates merged + writes only changed
 * ```
 */
export function defineStore<S, U extends Record<string, unknown> = Record<string, unknown>>(
  id: string,
  config: SchemaStoreConfig<S, U>,
): () => SchemaStoreApi<InferSchema<S>, SignalsOf<InferSchema<S>> & U>

/**
 * Define a store with a unique id and a setup function.
 * Returns a hook that returns a `StoreApi<T>` with the user's state under `.store`
 * and framework methods (`patch`, `subscribe`, `onAction`, `reset`, `dispose`) at the top level.
 */
export function defineStore<T extends Record<string, unknown>>(
  id: string,
  setup: () => T,
  options?: StoreOptions,
): () => StoreApi<T>

export function defineStore(
  id: string,
  configOrSetup: unknown,
  options?: StoreOptions,
): () => StoreApi<Record<string, unknown>> {
  // ── Schema-mode dispatch ────────────────────────────────────────────────
  // Discriminator: 2nd arg is an object with a `schema` field.
  if (configOrSetup != null && typeof configOrSetup === 'object' && 'schema' in configOrSetup) {
    return defineSchemaStore(id, configOrSetup as SchemaStoreConfig<unknown>)
  }

  // ── Setup-fn mode (existing path, unchanged) ────────────────────────────
  return defineSetupStore(id, configOrSetup as () => Record<string, unknown>, options?.ssr !== false)
}

/**
 * Schema-mode implementation — synthesizes a setup function from the
 * schema + initial + user setup, then funnels through the existing
 * setup-store pipeline. Wraps the resulting StoreApi with validated
 * `set` + `patch` methods.
 */
function defineSchemaStore(
  id: string,
  config: SchemaStoreConfig<unknown>,
): () => SchemaStoreApi<Record<string, unknown>, Record<string, unknown>> {
  const { schema, initial, setup: userSetup, onValidationError } = config

  // Resolve sync parse function (Tier A.1, A.2, or throw).
  const parse = extractParseFn(schema)

  // Validate `initial` once at defineStore-time. Throws if invalid, OR
  // if the schema is async (Promise return).
  const initialParsed = parse(initial as unknown)
  if (initialParsed instanceof Promise) {
    throw new Error(
      '[Pyreon] defineStore: schema is async (validator returned a Promise). ' +
        'Schema-driven stores require SYNCHRONOUS validation. ' +
        'For async refinements, use `@pyreon/form` or validate manually before set().',
    )
  }
  if (!initialParsed.ok) {
    throw new Error(formatIssues(initialParsed.issues, 'init'))
  }

  // The PARSED initial (defaults applied, transforms run) is the source
  // of truth — use it (not the raw `initial` argument) to seed signals.
  const parsedInitial = initialParsed.value

  // Reserved-key collision check on schema fields.
  for (const key of Object.keys(parsedInitial)) {
    if (RESERVED_STORE_KEYS.has(key)) {
      throw new Error(
        `[Pyreon] defineStore: schema field "${key}" collides with a reserved ` +
          `StoreApi method name. Rename the schema field.`,
      )
    }
  }

  // Validate-and-emit helper. Returns the parsed value on success;
  // throws (or calls onValidationError) on failure.
  function validateOrFail(value: unknown, op: 'set' | 'patch'): Record<string, unknown> {
    const result = parse(value)
    if (result instanceof Promise) {
      throw new Error(
        '[Pyreon] defineStore: schema returned a Promise at runtime — async unsupported.',
      )
    }
    if (!result.ok) {
      if (onValidationError) {
        onValidationError(result.issues, op)
        // Caller's onValidationError suppressed the throw — preserve the
        // CURRENT state (return a sentinel that signals "skip write").
        return SKIP_WRITE
      }
      throw new Error(formatIssues(result.issues, op))
    }
    return result.value as Record<string, unknown>
  }

  // Synthesize a setup function: per-field signals + user setup return.
  // Routes through the existing defineSetupStore pipeline so all
  // existing classifier / subscriber / plugin infrastructure works
  // unchanged. The validated `set` and `patch` are wired AFTER pipeline
  // construction (see below).
  let userResult: Record<string, unknown> = {}
  let perFieldSignals: Record<string, Signal<unknown>> = {}

  const useInner = defineSetupStore(id, () => {
    // Build per-field signals from the PARSED initial.
    perFieldSignals = {}
    for (const key of Object.keys(parsedInitial)) {
      perFieldSignals[key] = createSignal((parsedInitial as Record<string, unknown>)[key])
    }

    // Call user setup with the context. The user MAY return actions/
    // computeds that get merged into `store`. Collision with field
    // names is caught after user setup runs.
    if (userSetup) {
      const ctx: SchemaStoreContext<Record<string, unknown>> = {
        state: perFieldSignals as never,
        set: (next: Record<string, unknown>) => apiRef!.set(next),
        patch: (partial: Partial<Record<string, unknown>>) => apiRef!.patch(partial),
        reset: () => apiRef!.reset(),
      }
      userResult = (userSetup as unknown as (c: typeof ctx) => Record<string, unknown>)(ctx) ?? {}

      // Field-vs-action collision.
      for (const key of Object.keys(userResult)) {
        if (key in perFieldSignals) {
          throw new Error(
            `[Pyreon] defineStore: setup() returned key "${key}" that ` +
              `collides with schema field "${key}". Rename the action/computed.`,
          )
        }
      }
    }

    return { ...perFieldSignals, ...userResult }
  }, config.ssr !== false)

  // ── Validated `set` + `patch` wrappers ──────────────────────────────────
  let cachedInner: StoreApi<Record<string, unknown>> | null = null
  let apiRef: SchemaStoreApi<Record<string, unknown>, Record<string, unknown>> | null = null

  return function useSchemaStore(): SchemaStoreApi<Record<string, unknown>, Record<string, unknown>> {
    // Identity-stability + reset-safety. `useInner()` is a cheap registry
    // lookup that returns the SAME `StoreApi` identity until `resetStore(id)`
    // (or `resetAllStores()`) drops the entry; the next call then rebuilds
    // the inner via setup. The closure-cached `apiRef` wrapper must rebuild
    // whenever the inner identity flips — otherwise the wrapper survives
    // wrapping a disposed inner and every mutation routes through dead
    // bindings (silent data loss). This is the "closure-pinned cache
    // survives registry reset" leak class (Class C variant); audit #3
    // follow-up. Pre-fix the early `if (apiRef) return apiRef` short-
    // circuited BEFORE querying the registry, so resetStore was invisible
    // to schema-mode stores. Just-drop-cache would break the
    // identity-stability contract enforced by the "returns the same
    // StoreApi instance across multiple useStore() calls" spec — multiple
    // calls within the SAME inner instance must return the SAME wrapper.
    const inner = useInner() as StoreApi<Record<string, unknown>>
    if (inner !== cachedInner) {
      cachedInner = inner
      apiRef = null
    }
    if (apiRef) return apiRef
    const innerPatch = inner.patch.bind(inner)

    apiRef = {
      ...inner,
      get state() {
        return inner.state
      },
      set(next: Record<string, unknown>) {
        const valid = validateOrFail(next, 'set')
        if (valid === SKIP_WRITE) return
        innerPatch(valid)
      },
      patch(partialOrFn: Record<string, unknown> | ((state: Record<string, unknown>) => void)) {
        if (typeof partialOrFn === 'function') {
          // Functional form is an explicit escape hatch — raw signal
          // access, no validation possible. Document in JSDoc.
          innerPatch(partialOrFn as (state: Record<string, unknown>) => void)
          return
        }
        // Object form: merge with current snapshot, validate, write.
        const merged = { ...inner.state, ...partialOrFn }
        const valid = validateOrFail(merged, 'patch')
        if (valid === SKIP_WRITE) return
        // Only write the keys that actually changed to minimise
        // subscribe-notify fan-out (matches what plain `patch(partial)`
        // does in the setup-fn pipeline).
        const writeSet: Record<string, unknown> = {}
        for (const key of Object.keys(partialOrFn)) {
          writeSet[key] = valid[key]
        }
        innerPatch(writeSet)
      },
      deepPatch(partial: Record<string, unknown>) {
        // Deep-merge `partial` into the current state, then validate the
        // merged result via schema. Only plain objects recurse; arrays /
        // class instances / primitives replace. Same write-the-changed-
        // top-level-keys-only pattern as `patch`.
        const merged = deepMerge(inner.state, partial) as Record<string, unknown>
        const valid = validateOrFail(merged, 'patch')
        if (valid === SKIP_WRITE) return
        const writeSet: Record<string, unknown> = {}
        for (const key of Object.keys(partial)) {
          writeSet[key] = valid[key]
        }
        innerPatch(writeSet)
      },
      update(key: string, transformer: (current: unknown) => unknown) {
        // Transform a single top-level field via callback. Read current,
        // apply transformer, validate merged state, write only that key.
        const current = inner.state[key]
        const next = transformer(current)
        const merged = { ...inner.state, [key]: next }
        const valid = validateOrFail(merged, 'patch')
        if (valid === SKIP_WRITE) return
        innerPatch({ [key]: valid[key] })
      },
      reset() {
        const reParsed = parse(initial)
        if (!(reParsed instanceof Promise) && reParsed.ok) {
          innerPatch(reParsed.value as Record<string, unknown>)
        } else {
          inner.reset()
        }
      },
    } as SchemaStoreApi<Record<string, unknown>, Record<string, unknown>>

    return apiRef
  }
}

/**
 * Sentinel returned by `validateOrFail` when `onValidationError` suppresses
 * the throw — caller skips the write entirely.
 */
const SKIP_WRITE: Record<string, unknown> = Object.freeze({ __pyreon_skip_write__: true })

/**
 * Shared frozen empty events buffer — the between-patches placeholder for
 * `patchEvents` (never pushed to: `notifyDirect` only records while
 * `patchInProgress`, which always installs a fresh buffer first).
 */
const EMPTY_EVENTS: MutationInfo['events'] = Object.freeze([]) as unknown as MutationInfo['events']

/**
 * Dev-only: store ids already warned about a same-id redefinition (a registry
 * hit whose instance came from a different setup function). Bounded by the
 * number of DISTINCT warned ids — a small, dev-only diagnostic Set (never
 * read in production builds; the sole caller is inside a NODE_ENV gate).
 */
const _warnedRedefinedIds = new Set<string>()

/**
 * Existing setup-function-based store implementation. Unchanged from the
 * pre-schema version; the schema-mode pipeline synthesises a setup
 * function and routes through here, so the classifier / subscriber /
 * plugin infrastructure handles per-field signals + user actions
 * uniformly.
 */
function defineSetupStore<T extends Record<string, unknown>>(
  id: string,
  setup: () => T,
  ssr = true,
): () => StoreApi<T> {
  return function useStore(): StoreApi<T> {
    const registry = getRegistry()
    // Single lookup — the registry never stores `undefined`, so `get` doubles
    // as the membership check (saves the second Map hash on every hook call).
    const cached = registry.get(id)
    if (cached !== undefined) {
      if (process.env.NODE_ENV !== 'production') {
        // Redefinition diagnostic: a registry hit created from a DIFFERENT
        // setup function means either two `defineStore` calls share an id, or
        // the store module was hot-reloaded (HMR re-eval produces a new setup
        // identity). Both are silent-stale traps — the registered instance
        // keeps the OLD setup's actions/computeds. Warn once per id.
        const prior = (cached as { _setupFn?: unknown })._setupFn
        if (prior !== undefined && prior !== setup && !_warnedRedefinedIds.has(id)) {
          _warnedRedefinedIds.add(id)
          // oxlint-disable-next-line no-console
          console.warn(
            `[Pyreon] defineStore("${id}"): a store with this id already exists and was ` +
              `created from a DIFFERENT setup function — the existing instance (old setup) ` +
              `is returned. Causes: (a) two defineStore calls share an id, or (b) the store ` +
              `module was hot-reloaded — state is preserved but edited actions/computeds do ` +
              `NOT apply until resetStore("${id}") or a full reload.`,
          )
        }
      }
      return cached as StoreApi<T>
    }

    // Mount-N-stores baseline. Fires only on cache miss (cache hit short-circuits above)
    // so the counter measures FRESH store creations, not registry lookups.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.defineStore')

    const api = new SetupStore<T>(id, setup)

    if (process.env.NODE_ENV !== 'production') {
      // Non-enumerable dev-only stamp powering the redefinition diagnostic on
      // the registry-hit path above (invisible to spreads / Object.keys).
      Object.defineProperty(api, '_setupFn', { value: setup, configurable: true })
    }

    // Mark BEFORE `consumeHydration` so a client-only store ignores the server
    // snapshot, and before any render can dehydrate it.
    if (!ssr) markStoreSsrExcluded(api)
    registry.set(id, api)
    // Seed from server state if an SSR hydration snapshot is in flight (a single
    // null check when it isn't — see hydration.ts). Runs before any subscriber
    // can attach, so it hits the fast no-subscriber patch path.
    consumeHydration(id, api as { state: Record<string, unknown>; patch(p: Record<string, unknown>): void })
    _notifyChange()
    return api
  }
}

/**
 * One setup store: the object `useStore()` returns.
 *
 * WHY A CLASS. This used to be one large closure: every store allocated its
 * API methods and ~10 internal helpers as fresh closures over a shared scope.
 * A CPU profile of store creation put ~38% of the time in that body and ~36%
 * in garbage collection of what it allocated — ~880 ns per store against
 * ~80 ns for the user's own setup. Here the helpers are prototype methods, and
 * the per-store state is fields on the instance.
 *
 * THE PUBLIC METHODS STAY OWN PROPERTIES. `patch` / `subscribe` / `onAction` /
 * `reset` / `dispose` are bound once in the constructor and stored on the
 * instance, so destructuring (`const { patch } = useStore()`), detached use
 * (`onClick={api.reset}`) and spreading (`{ ...api }` — the schema-store
 * wrapper does exactly this) all keep working. Lazy prototype getters were
 * measured too: the same speed, but a spread silently dropped every method.
 * `state` is a prototype getter, so a spread no longer copies a `state`
 * snapshot — read `api.state` (it was a one-time snapshot even before).
 */
class SetupStore<T extends Record<string, unknown>> {
  store: T
  id: string

  // Store-owned effect scope. `setup()` (and plugin bodies below) run inside
  // it so every `computed()`/`effect()` they create is owned by the STORE:
  //  - SHIELDING: without this, a store first created inside a component
  //    body (the dominant lazy-creation shape — mount.ts sets the
  //    component's scope as current during setup) registered its computeds
  //    with THAT component's scope; the component's unmount then DISPOSED
  //    the singleton store's computeds, freezing them stale for every other
  //    consumer. `runInScope` swaps the ambient scope for the store's own.
  //  - DISPOSAL: `api.dispose()` stops the scope, disposing setup-created
  //    effects/computeds — without it, an effect reading an EXTERNAL signal
  //    kept firing (and retained the store's object graph) forever.
  // Matches Pinia: setup stores run in an effectScope; $dispose stops it.
  // Regression locks: src/tests/scope-ownership.test.ts (bisect-verified).
  _scope: EffectScope
  _raw: T

  // Signal fields, parallel arrays by index. Every hot path (`getState`,
  // change-detection, `patch`, `reset`) reaches a field's signal by INDEX
  // instead of a dynamic `raw[key]` lookup on the mixed signals+actions object.
  // `_initialVals` is the creation-time snapshot `reset()` restores.
  _signalKeys: string[] = []
  _signalObjs: SignalLike[] = []
  _initialVals: unknown[] = []

  // Key → index for `patch`; LAZY — most stores never call object-form patch.
  _keyIndex: Map<string, number> | null = null

  // ─── subscribe infrastructure (all lazy) ────────────────────────────────
  _subscribers: Set<SubscribeCallback> | null = null
  _patchInProgress = false
  // Nesting depth of the subscribed-patch window. A re-entrant `patch()` (a
  // user effect fired by the outer patch's batch drain calling `patch()`
  // again) must NOT close a window it did not open: only the OUTERMOST patch
  // clears `_patchInProgress`, merges `_patchEvents`, and emits the ONE
  // notification.
  _patchDepth = 0
  // Starts at the shared frozen empty array; allocated lazily on first push.
  _patchEvents: MutationInfo['events'] = EMPTY_EVENTS

  // Lazy change-detection subscriptions. The per-signal subscribers exist
  // ONLY to feed `_notifyDirect` → store-level `subscribe()` callbacks. They
  // are attached only while ≥1 store subscriber exists, so a no-subscriber
  // store's writes stay on the fast unsubscribed path. Parallel to
  // `_signalKeys`: `_signalUnsubs[i]` disposes field i's detector,
  // `_detectors[i]` is that detector (kept so the with-subscriber `patch()` can
  // detach it during its own writes), `_prevValues[i]` the last-seen value.
  _signalUnsubs: (() => void)[] | null = null
  _detectors: (() => void)[] | null = null
  _prevValues: unknown[] | null = null
  // Detector-wiring generation. Bumped whenever the detectors are (re)attached
  // or torn down. The with-subscriber patch only takes the O(1)
  // sole-subscriber suspend fast path while it is UNCHANGED — a mid-patch side
  // effect that rewires the detectors falls back to the per-listener suspend.
  _detectorEpoch = 0

  _actionListeners: Set<OnActionCallback> | null = null
  _pluginCleanups: (() => void)[] | null = null

  // Cached batch callbacks for `patch` — zero per-call closure allocation; the
  // argument and event buffer are handed across through these slots.
  _patchArg: Record<string, unknown> | ((state: Record<string, any>) => void) | null = null
  _applyPatchFn: (() => void) | null = null
  _signalMap: Record<string, unknown> | null = null
  _detachEvents: MutationInfo['events'] | null = null
  _detachApplyFn: (() => void) | null = null

  // The public methods: own properties bound to this store (see the class comment).
  patch: StoreApi<T>['patch']
  subscribe: StoreApi<T>['subscribe']
  onAction: StoreApi<T>['onAction']
  reset: StoreApi<T>['reset']
  dispose: StoreApi<T>['dispose']

  constructor(id: string, setup: () => T) {
    this.id = id
    this.patch = this._patch.bind(this) as StoreApi<T>['patch']
    this.subscribe = this._subscribe.bind(this)
    this.onAction = this._onAction.bind(this)
    this.reset = this._reset.bind(this)
    this.dispose = this._dispose.bind(this)
    const scope = effectScope()
    this._scope = scope
    const raw = scope.runInScope(setup)
    this._raw = raw

    // Classify + build the user store in ONE pass.
    const userStore: Record<string, unknown> = {}
    for (const key of Object.keys(raw)) {
      const val = raw[key]
      if (isSignalLike(val)) {
        this._signalKeys.push(key)
        this._signalObjs.push(val)
        this._initialVals.push(val.peek())
        userStore[key] = val
      } else if (typeof val === 'function') {
        if (typeof (val as unknown as Record<string, unknown>).dispose === 'function') {
          userStore[key] = val // computed — pass through
        } else {
          userStore[key] = this._wrapAction(key, val as (...args: any[]) => unknown)
        }
      } else {
        userStore[key] = val // plain value — pass through, inert
      }
    }
    this.store = userStore as T

    // Run plugins — errors in one plugin should not break store creation,
    // but they must be visible in dev mode so developers can diagnose.
    // Fast path: most apps register zero plugins.
    if (_plugins.length > 0) {
      // Plugins run inside the store's scope too: effects/computeds a plugin
      // creates are disposed with the store, and a plugin-returned cleanup
      // function runs on `dispose()`.
      scope.runInScope(() => {
        for (const plugin of _plugins) {
          // O(stores × plugins) is INHERENT: plugins are side-effecting
          // per-instance initializers (they attach behavior to THIS api
          // object), so each fresh store must run each plugin.
          if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.pluginRun')
          try {
            const cleanup = plugin(this as unknown as StoreApi<Record<string, unknown>>)
            if (typeof cleanup === 'function') (this._pluginCleanups ??= []).push(cleanup)
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              // oxlint-disable-next-line no-console
              console.warn(`[Pyreon] Store plugin error for "${id}":`, err)
            }
          }
        }
      })
    }
  }

  get state(): Record<string, unknown> {
    return this._getState()
  }

  _getKeyIndex(): Map<string, number> {
    if (this._keyIndex === null) {
      const keyIndex = new Map<string, number>()
      const sk = this._signalKeys
      for (let i = 0; i < sk.length; i++) keyIndex.set(sk[i] as string, i)
      this._keyIndex = keyIndex
    }
    return this._keyIndex
  }

  _getState(): Record<string, unknown> {
    const sk = this._signalKeys
    const so = this._signalObjs
    const state: Record<string, unknown> = {}
    for (let i = 0; i < sk.length; i++) {
      state[sk[i] as string] = (so[i] as SignalLike).peek()
    }
    return state
  }

  // Dev-only diagnostic for the #1 documented patch footgun — a key that
  // isn't a signal field (typo / computed / action) is silently dropped.
  _warnUnknownPatchKey(key: string): void {
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon] patch("${this.id}"): key "${key}" is not a signal field — ignored. ` +
          `Patchable fields: [${this._signalKeys.join(', ')}]. Computeds/actions are not ` +
          `patchable; use the functional form patch(s => …) for direct signal access.`,
      )
    }
  }

  // Fan out ONE mutation + state snapshot to every store subscriber.
  _emitToSubscribers(mutation: MutationInfo, state: Record<string, unknown>): void {
    for (const cb of this._subscribers as Set<SubscribeCallback>) {
      // Fan-out per notification × subscriber. High count under stress means
      // user code is over-subscribing.
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.subscribeNotify')
      cb(mutation, state)
    }
  }

  _notifyDirect(key: string, oldValue: unknown, newValue: unknown): void {
    if (this._patchInProgress) {
      // A subscriber is guaranteed here: `_patchInProgress` is set only by a
      // subscribed patch, and a detector only fires while subscribed.
      // `_patchEvents` is allocated LAZILY on first push.
      if (this._patchEvents === EMPTY_EVENTS) this._patchEvents = []
      this._patchEvents.push({ key, newValue, oldValue })
      return
    }
    const subscribers = this._subscribers
    if (subscribers === null || subscribers.size === 0) return
    const mutation: MutationInfo = {
      storeId: this.id,
      type: 'direct',
      events: [{ key, newValue, oldValue }],
    }
    this._emitToSubscribers(mutation, this._getState())
  }

  _activateSignalSubs(): void {
    if (this._signalUnsubs !== null && this._signalUnsubs.length > 0) return // already active
    this._detectorEpoch++
    if (this._signalUnsubs === null) {
      this._signalUnsubs = []
      this._detectors = []
      this._prevValues = []
    }
    const uns = this._signalUnsubs
    const dets = this._detectors as (() => void)[]
    const prevs = this._prevValues as unknown[]
    const sk = this._signalKeys
    const so = this._signalObjs
    for (let i = 0; i < sk.length; i++) {
      const key = sk[i] as string
      const sig = so[i] as SignalLike
      const idx = i
      prevs[idx] = sig.peek()
      const detector = () => {
        const next = sig.peek()
        const old = prevs[idx]
        prevs[idx] = next
        this._notifyDirect(key, old, next)
      }
      dets[idx] = detector
      uns[idx] = sig.subscribe(detector)
    }
  }

  _deactivateSignalSubs(): void {
    if (this._signalUnsubs === null) return
    this._detectorEpoch++
    for (const unsub of this._signalUnsubs) unsub()
    this._signalUnsubs.length = 0
  }

  _wrapAction(key: string, original: (...args: any[]) => unknown): (...args: unknown[]) => unknown {
    return (...args: unknown[]) => {
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.actionCall')

      const actionListeners = this._actionListeners
      if (actionListeners === null || actionListeners.size === 0) {
        return original(...args)
      }

      const afterCbs: ((result: unknown) => void)[] = []
      const errorCbs: ((error: unknown) => void)[] = []

      const context: ActionContext = {
        name: key,
        storeId: this.id,
        args,
        after: (cb) => afterCbs.push(cb),
        onError: (cb) => errorCbs.push(cb),
      }

      for (const listener of actionListeners) {
        if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.actionListenerNotify')
        listener(context)
      }

      try {
        const result = original(...args)

        if (result != null && typeof (result as Record<string, unknown>).then === 'function') {
          return (result as Promise<unknown>).then(
            (resolved) => {
              for (const cb of afterCbs) cb(resolved)
              return resolved
            },
            (err) => {
              for (const cb of errorCbs) cb(err)
              throw err
            },
          )
        }

        for (const cb of afterCbs) cb(result)
        return result
      } catch (err) {
        for (const cb of errorCbs) cb(err)
        throw err
      }
    }
  }

  _ensureApply(): () => void {
    if (this._applyPatchFn === null) {
      this._applyPatchFn = () => {
        const arg = this._patchArg as
          | Record<string, unknown>
          | ((state: Record<string, any>) => void)
        if (typeof arg === 'function') {
          if (this._signalMap === null) {
            const signalMap: Record<string, unknown> = {}
            for (const key of this._signalKeys) {
              signalMap[key] = this._raw[key]
            }
            this._signalMap = signalMap
          }
          arg(this._signalMap as Record<string, any>)
        } else {
          const kidx = this._getKeyIndex()
          const so = this._signalObjs
          for (const key of Object.keys(arg)) {
            const idx = kidx.get(key)
            if (idx !== undefined) {
              if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.patchKey')
              ;(so[idx] as SignalLike).set(arg[key])
            } else {
              this._warnUnknownPatchKey(key)
            }
          }
        }
      }
    }
    return this._applyPatchFn
  }

  // The with-subscriber object-form write loop. Each patched field's detector
  // is suspended while it is written (so the write does not round-trip the
  // batch queue just to rebuild change info we already have), then resumed in
  // a `finally` — a throwing write or getter can never leave a detector
  // detached. The patched value is read BEFORE suspending, so a throwing
  // getter on the patch object leaves the detector attached.
  _ensureDetachApply(): () => void {
    if (this._detachApplyFn === null) {
      this._detachApplyFn = () => {
        const arg = this._patchArg as Record<string, unknown>
        const events = this._detachEvents as MutationInfo['events']
        const kidx = this._getKeyIndex()
        const so = this._signalObjs
        const dets = this._detectors as (() => void)[]
        const prevs = this._prevValues as unknown[]
        const epoch0 = this._detectorEpoch
        for (const key of Object.keys(arg)) {
          const idx = kidx.get(key)
          if (idx === undefined) {
            this._warnUnknownPatchKey(key)
            continue
          }
          const newValue = arg[key]
          const sig = so[idx] as SignalLike
          const det = dets[idx] as () => void
          const rsig = sig as unknown as Signal<unknown>
          const saved = this._detectorEpoch === epoch0 ? _suspendSoleSubscriber(rsig) : null
          if (saved === null) _suspendSubscriber(rsig, det)
          const oldValue = sig.peek()
          if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.patchKey')
          try {
            sig.set(newValue)
          } finally {
            if (saved !== null) _resumeSoleSubscriber(rsig, saved, det)
            else _resumeSubscriber(rsig, det)
          }
          if (!Object.is(oldValue, newValue)) {
            events.push({ key, newValue, oldValue })
            prevs[idx] = newValue
          }
        }
      }
    }
    return this._detachApplyFn
  }

  _patch(partialOrFn: Record<string, unknown> | ((state: Record<string, any>) => void)): void {
    const subscribers = this._subscribers
    const hasSubs = subscribers !== null && subscribers.size > 0

    // ── Object form + subscribers: fast DETACH path ─────────────────────
    // Detach each patched field's detector, write the fields in one batch
    // (user computeds/effects reading them still fire), re-attach, and emit ONE
    // store notification built from the values just written. Re-entrant writes
    // during the drain buffer into `_patchEvents` (see `_notifyDirect`) and are
    // merged into this patch's single emit.
    if (hasSubs && typeof partialOrFn !== 'function') {
      const events: MutationInfo['events'] = []
      this._patchInProgress = true
      this._patchDepth++
      this._patchArg = partialOrFn
      this._detachEvents = events
      // Exception safety: the flag reset, slot resets, event merge and emit all
      // run in a `finally`, so a raw listener throwing past the batch queue
      // cannot wedge `_patchInProgress` or drop the notification.
      try {
        batch(this._ensureDetachApply())
      } finally {
        this._patchArg = null
        this._detachEvents = null
        // Decrement FIRST (and clear the flag before the emit) so a throwing
        // subscriber in the emit cannot wedge either.
        this._patchDepth--
        if (this._patchDepth === 0) {
          // Outermost patch — close the window, merge the buffer, emit ONE.
          this._patchInProgress = false
          let finalEvents = events
          if (this._patchEvents !== EMPTY_EVENTS) {
            finalEvents = events.concat(this._patchEvents)
            this._patchEvents = EMPTY_EVENTS
          }
          if (finalEvents.length > 0) {
            this._emitToSubscribers({ storeId: this.id, type: 'patch', events: finalEvents }, this._getState())
          }
        } else if (events.length > 0) {
          // NESTED patch: hand our writes to the shared buffer so the OUTERMOST
          // patch merges + emits them in its single notification.
          if (this._patchEvents === EMPTY_EVENTS) this._patchEvents = []
          for (let j = 0; j < events.length; j++) this._patchEvents.push(events[j]!)
        }
      }
      return
    }

    // ── Functional form (any), or object form with NO subscribers ───────
    // With no subscriber the flag + buffer machinery is dead weight, so a
    // no-subscriber patch (the common case) skips it entirely.
    if (hasSubs) {
      // Only the functional form reaches here with subscribers; its writes are
      // collected by the attached detectors into `_patchEvents`.
      this._patchInProgress = true
      this._patchDepth++
    }

    this._patchArg = partialOrFn
    // Exception safety (functional form): a throwing patch body — or a raw
    // subscriber firing during the drain — must not leave `_patchInProgress`
    // wedged nor drop the notification for writes that DID land.
    try {
      batch(this._ensureApply())
    } finally {
      this._patchArg = null
      if (hasSubs) {
        this._patchDepth--
        if (this._patchDepth === 0) {
          this._patchInProgress = false
          if (this._patchEvents.length > 0) {
            this._emitToSubscribers({ storeId: this.id, type: 'patch', events: this._patchEvents }, this._getState())
          }
          this._patchEvents = EMPTY_EVENTS
        }
      }
    }
  }

  _subscribe(callback: SubscribeCallback, options?: { immediate?: boolean }): () => void {
    // Bring change-detection live before the first subscriber so it sees every
    // subsequent mutation (idempotent for additional subscribers).
    this._activateSignalSubs()
    ;(this._subscribers ??= new Set()).add(callback)
    if (options?.immediate) {
      const mutation: MutationInfo = {
        storeId: this.id,
        type: 'direct',
        events: [],
      }
      callback(mutation, this._getState())
    }
    return () => {
      const subscribers = this._subscribers
      subscribers?.delete(callback)
      // Tear the per-signal subscriptions back down once the last store
      // subscriber leaves, restoring the fast unsubscribed-write path.
      if (subscribers === null || subscribers.size === 0) this._deactivateSignalSubs()
    }
  }

  _onAction(callback: OnActionCallback): () => void {
    ;(this._actionListeners ??= new Set()).add(callback)
    return () => {
      this._actionListeners?.delete(callback)
    }
  }

  _reset(): void {
    const sk = this._signalKeys
    const iv = this._initialVals
    // With subscribers, route through the object-form `patch` so a multi-field
    // reset emits ONE mutation (type 'patch') carrying every changed field.
    const subscribers = this._subscribers
    if (subscribers !== null && subscribers.size > 0) {
      const initial: Record<string, unknown> = {}
      for (let i = 0; i < sk.length; i++) initial[sk[i] as string] = iv[i]
      this._patch(initial)
      return
    }
    const so = this._signalObjs
    batch(() => {
      for (let i = 0; i < sk.length; i++) {
        ;(so[i] as SignalLike).set(iv[i])
      }
    })
  }

  _dispose(): void {
    // Plugin-returned cleanups first (they may still read state), nulled after
    // so a second dispose() is a no-op for them.
    if (this._pluginCleanups !== null) {
      const cleanups = this._pluginCleanups
      this._pluginCleanups = null
      for (const cleanup of cleanups) {
        try {
          cleanup()
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            // oxlint-disable-next-line no-console
            console.warn(`[Pyreon] Store plugin cleanup error for "${this.id}":`, err)
          }
        }
      }
    }
    this._deactivateSignalSubs()
    this._subscribers?.clear()
    this._actionListeners?.clear()
    // Stop the store-owned scope — disposes every computed/effect created
    // inside setup() and plugin bodies (idempotent).
    this._scope.stop()
    // Identity-checked: after `resetStore(id)` + a re-create, the registry
    // entry for `id` is a DIFFERENT, live store. A stale handle's `dispose()`
    // must not evict it.
    const reg = getRegistry()
    if (reg.get(this.id) === this) reg.delete(this.id)
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

// Dispose a registry entry BEFORE dropping it. `dispose()` stops the store's
// effectScope (setup/plugin computeds + effects), runs plugin cleanups, and
// deletes the registry entry itself — without this, a reset merely orphaned
// the entry while its scope kept firing on external signals forever (leak
// class B: subscriber retention after "reset"). Duck-checked so a foreign
// registry value (custom `setRegistryProvider`) degrades to a plain delete.
function disposeEntry(api: unknown): boolean {
  if (
    api !== null &&
    typeof api === 'object' &&
    typeof (api as { dispose?: unknown }).dispose === 'function'
  ) {
    ;(api as { dispose: () => void }).dispose()
    return true
  }
  return false
}

/** Destroy a store by id (disposing its effectScope + plugin cleanups) so the next `useStore()` re-runs setup. */
export function resetStore(id: string): void {
  const registry = getRegistry()
  if (!disposeEntry(registry.get(id))) registry.delete(id)
  _notifyChange()
}

/** Destroy all stores (disposing each) — useful for SSR isolation and tests. */
export function resetAllStores(): void {
  const registry = getRegistry()
  // Snapshot: dispose() deletes from the registry we're iterating.
  for (const api of Array.from(registry.values())) {
    disposeEntry(api)
  }
  registry.clear()
  _notifyChange()
}
