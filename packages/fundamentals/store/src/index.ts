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
import { consumeHydration } from './hydration'

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

/** Register a global store plugin. Plugins run when a store is first created. */
export function addStorePlugin(plugin: StorePlugin): void {
  _plugins.push(plugin)
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
): () => StoreApi<T>

export function defineStore(
  id: string,
  configOrSetup: unknown,
): () => StoreApi<Record<string, unknown>> {
  // ── Schema-mode dispatch ────────────────────────────────────────────────
  // Discriminator: 2nd arg is an object with a `schema` field.
  if (configOrSetup != null && typeof configOrSetup === 'object' && 'schema' in configOrSetup) {
    return defineSchemaStore(id, configOrSetup as SchemaStoreConfig<unknown>)
  }

  // ── Setup-fn mode (existing path, unchanged) ────────────────────────────
  return defineSetupStore(id, configOrSetup as () => Record<string, unknown>)
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
  })

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
    const scope = effectScope()
    const raw = scope.runInScope(setup)

    // Classify + build the user store in ONE pass (was two: classify, then a
    // second keys loop with an O(actions) `includes` per key).
    const signalKeys: string[] = []
    // Signal refs cached in a DENSE array parallel to `signalKeys`. Every hot
    // path (`getState`, change-detection, `patch`, `reset`) reaches a field's
    // signal by INDEX (`signalObjs[i]`) instead of a dynamic `raw[key]` string-
    // keyed property lookup on the mixed signals+actions object — an array load
    // is materially cheaper than a megamorphic object property access, and the
    // patch/notify paths touch each signal several times per call.
    const signalObjs: SignalLike[] = []
    // Initial values captured at creation for `reset()`, kept as a parallel
    // array aligned with `signalKeys` (both pushed in the same iteration below).
    // An array is cheaper to build than a `Map` on the setup path, and `reset()`
    // — the sole consumer — zips the two by index. (The snapshot MUST happen at
    // creation, so this can't be deferred like `keyIndex`/`subscribers`.)
    const initialVals: unknown[] = []

    // O(1) membership AND key→index resolution for the `patch` hot path (vs an
    // O(signalKeys) array scan per patched key). A single `Map<key, index>`
    // serves both: `.has(key)` is the membership check the no-subscriber patch
    // uses, `.get(key)` is the index the with-subscriber patch uses to reach a
    // field's change-detector + prevValues slot. LAZY: built on the first
    // `patch()` object-form call and reused thereafter — most stores mutate via
    // `store.x.set()` / actions and never call `patch()`, so it's pure setup
    // overhead for them. Mirrors the lazy `subscribers` Set below.
    let keyIndex: Map<string, number> | null = null
    function getKeyIndex(): Map<string, number> {
      if (keyIndex === null) {
        keyIndex = new Map()
        for (let i = 0; i < signalKeys.length; i++) keyIndex.set(signalKeys[i] as string, i)
      }
      return keyIndex
    }

    // ─── subscribe infrastructure ───────────────────────────────────────
    // Lazy Set allocation: most stores never get a user subscribe() call.
    // Initialise as null and allocate only on first add — for a 1k-store
    // mount that's 1000 fewer Set allocations per page boot.
    let subscribers: Set<SubscribeCallback> | null = null
    let patchInProgress = false
    // Starts at the shared frozen empty array — a fresh buffer is assigned at
    // the top of every subscribed patch, and `notifyDirect` only pushes while
    // `patchInProgress` (which implies the fresh buffer). Saves one array
    // allocation per store at setup + one per subscribed patch at the end.
    let patchEvents: MutationInfo['events'] = EMPTY_EVENTS

    function getState(): Record<string, unknown> {
      const state: Record<string, unknown> = {}
      for (let i = 0; i < signalKeys.length; i++) {
        state[signalKeys[i] as string] = (signalObjs[i] as SignalLike).peek()
      }
      return state
    }

    // Dev-only diagnostic for the #1 documented patch footgun — a key that
    // isn't a signal field (typo / computed / action) is silently dropped.
    // Shared by both object-patch paths so the message lives in one place; the
    // whole body tree-shakes out of production builds.
    function warnUnknownPatchKey(key: string) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon] patch("${id}"): key "${key}" is not a signal field — ignored. ` +
            `Patchable fields: [${signalKeys.join(', ')}]. Computeds/actions are not ` +
            `patchable; use the functional form patch(s => …) for direct signal access.`,
        )
      }
    }

    // Fan out ONE mutation + state snapshot to every store subscriber. Shared
    // by the direct-write path and both patch emit paths so the notify loop +
    // its fan-out counter live in exactly one place.
    function emitToSubscribers(mutation: MutationInfo, state: Record<string, unknown>) {
      for (const cb of subscribers as Set<SubscribeCallback>) {
        // Fan-out per notification × subscriber. High count under stress means
        // user code is over-subscribing — collapse with a selector pattern or
        // move state into a dedicated store.
        if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.subscribeNotify')
        cb(mutation, state)
      }
    }

    function notifyDirect(key: string, oldValue: unknown, newValue: unknown) {
      if (patchInProgress) {
        // A subscriber is guaranteed here: `patchInProgress` is set only by a
        // subscribed patch (both paths gate on ≥1 subscriber) and a detector
        // only fires while subscribed — so no null/size guard is needed.
        // `patchEvents` starts as the shared frozen EMPTY buffer and is
        // allocated LAZILY on first push, so a patch whose detectors never fire
        // (the detach path's common case: patched fields are written with their
        // detectors suspended, so only a re-entrant effect writing ANOTHER store
        // field during the drain lands here) pays no buffer allocation at all.
        if (patchEvents === EMPTY_EVENTS) patchEvents = []
        patchEvents.push({ key, newValue, oldValue })
        return
      }
      if (subscribers === null || subscribers.size === 0) return
      const mutation: MutationInfo = {
        storeId: id,
        type: 'direct',
        events: [{ key, newValue, oldValue }],
      }
      emitToSubscribers(mutation, getState())
    }

    // Lazy change-detection subscriptions. The per-signal subscribers exist
    // ONLY to feed `notifyDirect` → store-level `subscribe()` callbacks (and the
    // `patch()` mutation event). Most stores never call `.subscribe()`, so
    // subscribing eagerly was pure overhead — AND it forced every signal write
    // onto the slow batched-notify path: a SUBSCRIBED signal written inside the
    // `patch()` / `reset()` batch round-trips the reactivity pending queue
    // (~10× a direct write), whereas an UNSUBSCRIBED write hits the inline
    // fast path. We now subscribe only while ≥1 store subscriber is attached;
    // a no-subscriber store's `patch()` writes its signals unsubscribed + fast.
    // Lazy arrays — most stores never get a `subscribe()` call, so don't pay
    // the allocation at setup (same rationale as `subscribers`). All three are
    // parallel to `signalKeys` by index: `signalUnsubs[i]` disposes the
    // detector for field `i`, `detectors[i]` is that detector's callback (kept
    // so the with-subscriber `patch()` can detach it during its own writes then
    // re-subscribe it), and `prevValues[i]` holds the last-seen value the
    // detector diffs against. `prev` is shared state (not a per-detector
    // closure local) precisely so `patch()` — which writes the signal while its
    // detector is detached — can keep it in sync (`prevValues[i] = newValue`)
    // without the detector ever running.
    let signalUnsubs: (() => void)[] | null = null
    let detectors: (() => void)[] | null = null
    let prevValues: unknown[] | null = null
    // Detector-wiring generation. Bumped whenever the per-field detectors are
    // (re)attached or torn down. The with-subscriber patch loop captures it at
    // entry and only takes the O(1) sole-subscriber suspend fast path while it
    // is UNCHANGED — an exotic synchronous side-effect mid-patch (a wrapped
    // signal's `set` — or a hostile patch-object getter — unsubscribing the
    // last store subscriber, which deactivates the detectors) would otherwise
    // break the fast path's "the sole `_s` entry IS our detector" precondition
    // and wholesale-suspend a USER listener for that write. Epoch mismatch ⇒
    // fall back to the per-listener suspend (current-behavior-identical).
    let detectorEpoch = 0
    function activateSignalSubs(): void {
      if (signalUnsubs !== null && signalUnsubs.length > 0) return // already active (idempotent)
      detectorEpoch++
      if (signalUnsubs === null) {
        signalUnsubs = []
        detectors = []
        prevValues = []
      }
      const uns = signalUnsubs
      const dets = detectors as (() => void)[]
      const prevs = prevValues as unknown[]
      for (let i = 0; i < signalKeys.length; i++) {
        const key = signalKeys[i] as string
        const sig = signalObjs[i] as SignalLike
        const idx = i
        prevs[idx] = sig.peek()
        const detector = () => {
          const next = sig.peek()
          const old = prevs[idx]
          prevs[idx] = next
          notifyDirect(key, old, next)
        }
        dets[idx] = detector
        uns[idx] = sig.subscribe(detector)
      }
    }
    function deactivateSignalSubs(): void {
      if (signalUnsubs === null) return
      detectorEpoch++
      for (const unsub of signalUnsubs) unsub()
      signalUnsubs.length = 0
    }

    // ─── onAction infrastructure ────────────────────────────────────────
    // Lazy Set allocation — most stores never get a user onAction() call.
    // The action wrapper still pays the null-check on every action call,
    // but the empty-listener case skips both Set allocation AND iteration.
    let actionListeners: Set<OnActionCallback> | null = null

    // Wrap actions
    function wrapAction(key: string, original: (...args: any[]) => unknown) {
      return (...args: unknown[]) => {
        // Per wrapped-action invocation. Pair with `store.actionListenerNotify`
        // for the listener fan-out ratio. Fires on BOTH fast path and slow
        // path so the action-count denominator stays correct.
        if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.actionCall')

        // Fast path: no listeners attached → skip ActionContext allocation
        // and the after/onError callback arrays entirely. Exceptions
        // propagate naturally to the caller.
        if (actionListeners === null || actionListeners.size === 0) {
          return original(...args)
        }

        const afterCbs: ((result: unknown) => void)[] = []
        const errorCbs: ((error: unknown) => void)[] = []

        const context: ActionContext = {
          name: key,
          storeId: id,
          args,
          after: (cb) => afterCbs.push(cb),
          onError: (cb) => errorCbs.push(cb),
        }

        for (const listener of actionListeners) {
          // Fires BEFORE the action body runs. Ratio = listener count.
          // Diverging from `actionCall` ratio across runs = listeners
          // attaching/detaching (likely a leak).
          if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.actionListenerNotify')
          listener(context)
        }

        try {
          const result = original(...args)

          // Handle async actions: if the result is a thenable, wait for
          // resolution before calling after/onError callbacks.
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

    // ─── Classify + build user store object (single pass) ──────────────
    const userStore: Record<string, unknown> = {}

    for (const key of Object.keys(raw)) {
      const val = raw[key]
      if (isSignalLike(val)) {
        signalKeys.push(key)
        signalObjs.push(val)
        initialVals.push(val.peek())
        userStore[key] = val
      } else if (typeof val === 'function') {
        // Not signal-like (checked above), so `isComputedLike` reduces to the
        // `.dispose` duck-check: a computed passes through, everything else
        // callable becomes a wrapped action.
        if (typeof (val as unknown as Record<string, unknown>).dispose === 'function') {
          userStore[key] = val // computed — pass through
        } else {
          userStore[key] = wrapAction(key, val as (...args: any[]) => unknown)
        }
      } else {
        userStore[key] = val // plain value — pass through, inert
      }
    }

    // Plugin-returned cleanup functions — run on `dispose()`. Lazy (most
    // plugins return nothing; most apps register zero plugins).
    let pluginCleanups: (() => void)[] | null = null

    // Per-call state for the object/functional `patch` forms. The apply
    // closure is created ONCE on first patch and reused (by EVERY patch path —
    // functional, no-subscriber object, AND the with-subscriber detach path) —
    // the previous shape allocated a fresh batch-callback closure per call.
    // `patchArg` hands the argument across; the closure reads it into a local
    // FIRST so a re-entrant patch (from a user effect during the batch drain)
    // can't clobber it mid-apply.
    let patchArg: Record<string, unknown> | ((state: Record<string, any>) => void) | null = null
    let applyPatchFn: (() => void) | null = null
    // Cached functional-form signal map — the signals never change identity
    // after creation, so build it once on the first functional patch.
    let signalMap: Record<string, unknown> | null = null
    // Lazily build + return the shared per-store batched-write closure. It
    // reads `patchArg`: a function → functional form (writes via `signalMap`),
    // an object → object form (writes each signal field by index, warns on an
    // unknown key). The with-subscriber detach path calls this AFTER suspending
    // the field detectors, so its writes don't round-trip the notify machinery.
    function ensureApply(): () => void {
      if (applyPatchFn === null) {
        applyPatchFn = () => {
          // Read the handed-across argument into a local FIRST — a re-entrant
          // patch (user effect during the batch drain) reassigns `patchArg`
          // and must not clobber this invocation's argument.
          const arg = patchArg as
            | Record<string, unknown>
            | ((state: Record<string, any>) => void)
          if (typeof arg === 'function') {
            // Functional form: pass an object with the actual signals so user
            // calls .set(). Map built once — signal identities are fixed.
            if (signalMap === null) {
              signalMap = {}
              for (const key of signalKeys) {
                signalMap[key] = raw[key]
              }
            }
            arg(signalMap as Record<string, any>)
          } else {
            // Object form: `keyIndex` resolves key→index; a hit reaches the
            // signal by array index (`signalObjs[idx]`) instead of a dynamic
            // `raw[key]` lookup, and an unknown key (`undefined`) is the
            // silent-drop footgun surfaced in dev.
            const kidx = getKeyIndex()
            for (const key of Object.keys(arg)) {
              const idx = kidx.get(key)
              if (idx !== undefined) {
                if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.patchKey')
                ;(signalObjs[idx] as SignalLike).set(arg[key])
              } else {
                warnUnknownPatchKey(key)
              }
            }
          }
        }
      }
      return applyPatchFn
    }

    // Per-call state + cached apply closure for the with-subscriber DETACH
    // path (mirrors `patchArg`/`ensureApply` above — the previous shape
    // allocated a fresh batch-callback closure per subscribed patch). `patch()`
    // hands the argument across via `patchArg` and the per-patch event buffer
    // via `detachEvents`; the closure reads BOTH into locals FIRST so a
    // re-entrant with-subscriber patch (from a user effect during the batch
    // drain) can't clobber them mid-apply — the outer invocation keeps its own
    // references, exactly like `ensureApply`'s `patchArg` discipline.
    let detachEvents: MutationInfo['events'] | null = null
    let detachApplyFn: (() => void) | null = null
    function ensureDetachApply(): () => void {
      if (detachApplyFn === null) {
        detachApplyFn = () => {
          // Re-entrancy: locals first (see the slot comment above).
          const arg = patchArg as Record<string, unknown>
          const events = detachEvents as MutationInfo['events']
          // Hoist every field read into a LOCAL up front. In the hot loop these
          // are read repeatedly; a closure-captured (context) variable costs a
          // scope-chain walk per read, a local doesn't — measured ~35% of this
          // path's cost was closure-scope access before hoisting.
          const kidx = getKeyIndex()
          const so = signalObjs
          const dets = detectors as (() => void)[]
          const prevs = prevValues as unknown[]
          // Capture the detector-wiring generation BEFORE any user code
          // (patch-object getters, wrapped-signal set side-effects) can run —
          // the sole-subscriber fast path below is only valid while unchanged.
          const epoch0 = detectorEpoch
          // ONE pass over the patched keys: per key, suspend that field's
          // detector, write, then re-attach immediately. Only OUR detector is
          // silenced for that write; any USER computed/effect reading the field
          // is still subscribed and (because we're inside `batch`) recomputes
          // exactly ONCE after all writes. Suspension takes the O(1)
          // `_suspendSoleSubscriber` Set-swap when our detector is the sole
          // `subscribe()` listener (the dominant case — measured the function-
          // key Set delete/add pairs as the single largest component of this
          // path, ~25% of the whole patch), falling back to the per-listener
          // `_suspendSubscriber` delete/add when user listeners/effects share
          // the signal's subscriber set — or when `epoch0` no longer matches
          // (detectors re-wired by a mid-patch side-effect; see detectorEpoch).
          //
          // Exception safety (a suspend/mutate/resume window over shared
          // subscriber state MUST leave the set consistent on ANY throw path):
          //  - `arg[key]` is read BEFORE suspending — a throwing getter/Proxy
          //    then aborts with the detector still ATTACHED (a detach-then-
          //    throw would silently un-notify every later direct write to that
          //    field until the next patch re-attached it).
          //  - `sig.set` runs in `try { … } finally { resume }` — a write that
          //    throws (a wrapped signal whose write side-effect fails) still
          //    re-attaches the detector (restoring the swapped Set on the fast
          //    path) before propagating.
          //  - `patchInProgress` + the event merge + the emit are handled by
          //    the CALLER's `finally` around the whole drain (see `patch()`).
          for (const key of Object.keys(arg)) {
            const idx = kidx.get(key)
            if (idx === undefined) {
              warnUnknownPatchKey(key)
              continue
            }
            // Read the value FIRST — before suspending — so a throwing
            // getter leaves the detector attached (see the block comment).
            const newValue = arg[key]
            const sig = so[idx] as SignalLike
            const det = dets[idx] as () => void
            const rsig = sig as unknown as Signal<unknown>
            const saved = detectorEpoch === epoch0 ? _suspendSoleSubscriber(rsig) : null
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
      return detachApplyFn
    }

    // ─── Build StoreApi ─────────────────────────────────────────────────
    const api: StoreApi<T> = {
      store: userStore as T,

      id,

      get state() {
        return getState()
      },

      patch(partialOrFn: Record<string, unknown> | ((state: Record<string, any>) => void)) {
        const hasSubs = subscribers !== null && subscribers.size > 0

        // ── Object form + subscribers: fast DETACH path ─────────────────────
        // Writing our OWN signals while their store change-detectors are
        // attached would round-trip every write through the reactivity batch
        // queue (enqueue + drain the detector effect) purely to rebuild change
        // info we ALREADY have — the patched keys and their old/new values. So
        // we detach each patched field's detector, write the fields in a single
        // batch (any USER computed/effect reading those fields still fires,
        // batched — only OUR internal detector is silenced), then re-attach and
        // emit ONE store notification built directly from the values we just
        // wrote. This removes the per-signal detector round-trip that made bulk
        // `patch()` lose to a shallow-merge store on the realistic
        // with-subscriber path (the round-trip alone exceeds a single merge).
        if (hasSubs && typeof partialOrFn !== 'function') {
          const events: MutationInfo['events'] = []
          // Keep the ONE-notification contract even under re-entrancy: if a USER
          // effect/computed fired by our batch writes ANOTHER store field during
          // the drain, that field's (attached) detector runs `notifyDirect`
          // which — because `patchInProgress` is set — BUFFERS into `patchEvents`
          // (lazily allocated) instead of emitting its own notification; we then
          // merge those into this patch's single emit. The common case never
          // touches `patchEvents` (stays the frozen EMPTY buffer, zero alloc).
          patchInProgress = true
          // The suspend/write/resume loop lives in the CACHED `ensureDetachApply`
          // closure (zero per-patch closure allocation — the argument + event
          // buffer are handed across via `patchArg`/`detachEvents`, read into
          // locals at closure entry for re-entrancy safety). This removes the
          // per-signal detector round-trip that made bulk `patch()` lose to a
          // shallow-merge store — with no scratch arrays and no per-call
          // closures, matching the theoretical minimum for a signal-per-field
          // store. Full suspension-design + exception-safety notes live on
          // `ensureDetachApply`.
          //
          // Exception safety at THIS level: `patchInProgress = false` + the
          // slot resets + the event merge + the emit run in a `finally` around
          // the whole drain — a raw `field.subscribe` listener that throws
          // straight past the batch queue can't wedge the flag (which would
          // buffer + drop every later direct write's event) or drop the
          // notification for the fields that WERE written.
          patchArg = partialOrFn
          detachEvents = events
          try {
            batch(ensureDetachApply())
          } finally {
            patchArg = null
            detachEvents = null
            patchInProgress = false
            // Merge any events a re-entrant effect buffered during the drain
            // (empty in the common case → no concat, no alloc). When `patchEvents`
            // is non-EMPTY a re-entrant write occurred, which means a patched
            // signal must have changed to trigger it, so `events` is already
            // non-empty — `concat` (never a bare swap) is always correct.
            let finalEvents = events
            if (patchEvents !== EMPTY_EVENTS) {
              finalEvents = events.concat(patchEvents)
              patchEvents = EMPTY_EVENTS
            }
            // Emit ONE store notification with the events we built directly.
            if (finalEvents.length > 0) {
              // Build the state snapshot inline off hoisted locals rather
              // than calling `getState()` (a closure hop that re-reads the same
              // captured arrays) — the snapshot IS a hot-path allocation.
              const sk = signalKeys
              const so = signalObjs
              const state: Record<string, unknown> = {}
              for (let j = 0; j < sk.length; j++) {
                state[sk[j] as string] = (so[j] as SignalLike).peek()
              }
              emitToSubscribers({ storeId: id, type: 'patch', events: finalEvents }, state)
            }
          }
          return
        }

        // ── Functional form (any), or object form with NO subscribers ───────
        // The `patchInProgress` flag + `patchEvents` buffer feed store-level
        // `subscribe()` callbacks for the FUNCTIONAL form (where we can't know
        // the touched keys ahead of time, so the detectors collect the events
        // as they fire). With no subscriber the whole machinery is dead weight,
        // so a no-subscriber patch (the common case) skips both `patchEvents`
        // allocations + the flag dance entirely.
        if (hasSubs) {
          // Only reachable for the functional form here (the object form with
          // subs returned above). `patchEvents` stays the frozen EMPTY buffer
          // until a detector fires (lazily allocated in `notifyDirect`).
          patchInProgress = true
        }

        patchArg = partialOrFn
        // Exception safety (functional form): a throwing patch body — or a raw
        // subscriber firing during the drain — must not leave `patchInProgress`
        // wedged (which buffers + drops every later direct write's event) nor
        // drop the notification for the writes that DID land before the throw.
        // `patchArg` reset + flag reset + emit all run in a `finally`.
        try {
          batch(ensureApply())
        } finally {
          patchArg = null
          if (hasSubs) {
            patchInProgress = false
            // Emit a single notification for the patch.
            if (patchEvents.length > 0) {
              emitToSubscribers({ storeId: id, type: 'patch', events: patchEvents }, getState())
            }
            // Release the emitted buffer to its subscribers; the shared frozen
            // empty array stands in until the next subscribed patch.
            patchEvents = EMPTY_EVENTS
          }
        }
      },

      subscribe(callback: SubscribeCallback, options?: { immediate?: boolean }): () => void {
        // Bring change-detection live before the first subscriber so it sees
        // every subsequent mutation (idempotent for additional subscribers).
        activateSignalSubs()
        ;(subscribers ??= new Set()).add(callback)
        if (options?.immediate) {
          const mutation: MutationInfo = {
            storeId: id,
            type: 'direct',
            events: [],
          }
          callback(mutation, getState())
        }
        return () => {
          subscribers?.delete(callback)
          // Tear the per-signal subscriptions back down once the last store
          // subscriber leaves, restoring the fast unsubscribed-write path.
          if (subscribers === null || subscribers.size === 0) deactivateSignalSubs()
        }
      },

      onAction(callback: OnActionCallback): () => void {
        ;(actionListeners ??= new Set()).add(callback)
        return () => {
          actionListeners?.delete(callback)
        }
      },

      reset() {
        batch(() => {
          for (let i = 0; i < signalKeys.length; i++) {
            ;(signalObjs[i] as SignalLike).set(initialVals[i])
          }
        })
      },

      dispose() {
        // Plugin-returned cleanups first (they may still read state), nulled
        // after so a second dispose() is a no-op for them.
        if (pluginCleanups !== null) {
          const cleanups = pluginCleanups
          pluginCleanups = null
          for (const cleanup of cleanups) {
            try {
              cleanup()
            } catch (err) {
              if (process.env.NODE_ENV !== 'production') {
                // oxlint-disable-next-line no-console
                console.warn(`[Pyreon] Store plugin cleanup error for "${id}":`, err)
              }
            }
          }
        }
        deactivateSignalSubs()
        subscribers?.clear()
        actionListeners?.clear()
        // Stop the store-owned scope — disposes every computed/effect created
        // inside setup() and plugin bodies (idempotent; see scope-ownership
        // regression tests).
        scope.stop()
        getRegistry().delete(id)
      },
    }

    // Run plugins — errors in one plugin should not break store creation,
    // but they must be visible in dev mode so developers can diagnose.
    // Fast path: most apps register zero plugins. Skipping the loop entirely
    // saves the iteration + try/catch frame allocation for every fresh
    // store creation in the common case.
    if (_plugins.length > 0) {
      // Plugins run inside the store's scope too: effects/computeds a plugin
      // creates are disposed with the store, and a plugin-returned cleanup
      // function runs on `dispose()`.
      scope.runInScope(() => {
        for (const plugin of _plugins) {
          // O(stores × plugins) is INHERENT, not an optimization target:
          // plugins are side-effecting per-instance initializers (they
          // attach behavior to THIS api object), so each fresh store must
          // run each plugin — there is no semantics-preserving cache. The
          // earlier "cache the plugin-init result per store-id" note was
          // measured + rejected (2026-06): a noop plugin costs ~0.2µs here
          // and the loop already skips entirely for the zero-plugin common
          // case. storePluginScale-1000's pluginRun ∝ stores×plugins is the
          // CORRECT signature for this contract.
          if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('store.pluginRun')
          try {
            const cleanup = plugin(api as StoreApi<Record<string, unknown>>)
            if (typeof cleanup === 'function') (pluginCleanups ??= []).push(cleanup)
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              // oxlint-disable-next-line no-console
              console.warn(`[Pyreon] Store plugin error for "${id}":`, err)
            }
          }
        }
      })
    }

    if (process.env.NODE_ENV !== 'production') {
      // Non-enumerable dev-only stamp powering the redefinition diagnostic on
      // the registry-hit path above (invisible to spreads / Object.keys).
      Object.defineProperty(api, '_setupFn', { value: setup, configurable: true })
    }

    registry.set(id, api)
    // Seed from server state if an SSR hydration snapshot is in flight (a single
    // null check when it isn't — see hydration.ts). Runs before any subscriber
    // can attach, so it hits the fast no-subscriber patch path.
    consumeHydration(id, api as { state: Record<string, unknown>; patch(p: Record<string, unknown>): void })
    _notifyChange()
    return api
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
