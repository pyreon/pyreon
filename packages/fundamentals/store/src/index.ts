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
 * Stores are singletons — the setup function runs once per store id.
 * Call `resetStore(id)` or `resetAllStores()` to clear the registry
 * (useful for testing or HMR).
 *
 * For concurrent SSR, call setStoreRegistryProvider() with an
 * AsyncLocalStorage-backed provider so each request gets isolated store state.
 */

import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/store
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/store', '0.24.6', import.meta.url)

const __DEV__: boolean = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
// Globalthis sink (no @pyreon/perf-harness import) so this file stays
// publishable without a dev-only dep, and the counter strings + guard
// tree-shake out at consumer build time.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export type { Signal } from '@pyreon/reactivity'
export { batch, computed, effect, signal } from '@pyreon/reactivity'

import { batch, signal as createSignal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'

export { setRegistryProvider as setStoreRegistryProvider } from './registry'

import { _notifyChange } from './devtools'
import { getRegistry } from './registry'

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

export type StorePlugin = (api: StoreApi<Record<string, unknown>>) => void

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

function isComputedLike(v: unknown): boolean {
  if (typeof v !== 'function') return false
  const fn = v as unknown as Record<string, unknown>
  return typeof fn.dispose === 'function' && !isSignalLike(v)
}

// ─── Plugin system ───────────────────────────────────────────────────────────

const _plugins: StorePlugin[] = []

/** Register a global store plugin. Plugins run when a store is first created. */
export function addStorePlugin(plugin: StorePlugin): void {
  _plugins.push(plugin)
}

// ─── Schema-driven store types (Tier A.1 + A.2) ──────────────────────────────

/**
 * Generic issue produced by any schema validator. Mirrors the shape of
 * `@pyreon/validation`'s `ValidationIssue` — duck-typed here so this
 * package doesn't need a hard dependency on validation.
 */
export interface SchemaIssue {
  readonly path: string
  readonly message: string
}

/** Result of a synchronous schema parse call. */
export type SchemaParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: SchemaIssue[] }

/**
 * Duck-typed `TypedSchemaAdapter` shape (Tier A.1) — Pyreon's existing
 * adapter pattern from `@pyreon/validation`. We don't import the type;
 * structural detection via `'_infer' in schema && typeof schema.parse === 'function'`
 * keeps `@pyreon/store` free of the validation dep.
 */
interface PyreonAdapterShape<T extends Record<string, unknown>> {
  readonly _infer: T
  readonly parse?: (value: unknown) => SchemaParseResult<T>
}

/**
 * Duck-typed Standard Schema shape (Tier A.2) — cross-library spec
 * implemented by zod 3.24+, valibot 1.0+, arktype 2.0+, Effect Schema, etc.
 * Detected via `'~standard' in schema`.
 *
 * See https://standardschema.dev/ for the full spec.
 */
interface StandardSchemaShape<T> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) =>
      | { readonly value: T }
      | { readonly issues: ReadonlyArray<{ readonly message: string; readonly path?: ReadonlyArray<string | number | symbol | { readonly key: PropertyKey }> }> }
      | Promise<unknown>
    readonly types?: { readonly input?: unknown; readonly output?: T }
  }
}

/**
 * Extract the inferred output type from either adapter shape.
 *   Tier A.1 → `_infer`
 *   Tier A.2 → `~standard.types.output`
 */
export type InferSchema<S> =
  S extends { readonly _infer: infer T extends Record<string, unknown> } ? T :
  S extends { readonly '~standard': { readonly types: { readonly output: infer O extends Record<string, unknown> } } } ? O :
  Record<string, unknown>

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
export interface SchemaStoreConfig<
  S,
  U extends Record<string, unknown> = Record<string, unknown>,
> {
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

/** `StoreApi` extended with the validated `set` method (schema mode only). */
export interface SchemaStoreApi<T> extends StoreApi<T> {
  /** Replace the whole state. Validates input via schema; throws on failure. */
  set(next: Record<string, unknown>): void
}

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

/**
 * Detect a Pyreon `TypedSchemaAdapter` (Tier A.1). The `_infer` field is
 * the brand; `parse` is the sync entry point store needs.
 */
function isPyreonAdapter(value: unknown): value is PyreonAdapterShape<Record<string, unknown>> {
  return (
    value != null &&
    typeof value === 'object' &&
    '_infer' in value &&
    typeof (value as { parse?: unknown }).parse === 'function'
  )
}

/**
 * Detect a Standard Schema-compliant schema (Tier A.2). Spec:
 * https://standardschema.dev/
 */
function isStandardSchema(value: unknown): value is StandardSchemaShape<unknown> {
  if (value == null || typeof value !== 'object') return false
  const std = (value as { '~standard'?: unknown })['~standard']
  return (
    std != null &&
    typeof std === 'object' &&
    typeof (std as { validate?: unknown }).validate === 'function'
  )
}

/**
 * Extract a sync `parse` function from either adapter shape. Throws if
 * neither shape matches OR if the schema is async-only (probed at
 * `defineStore`-time by invoking parse with `initial` and checking for
 * a Promise return).
 */
function extractParseFn<T extends Record<string, unknown>>(
  schema: unknown,
  initial: T,
): (value: unknown) => SchemaParseResult<T> {
  if (isPyreonAdapter(schema)) {
    const parse = schema.parse
    if (!parse) {
      throw new Error(
        '[Pyreon] defineStore: schema adapter is missing `parse` method. ' +
          'Upgrade @pyreon/validation to a version that exports `parse` ' +
          '(zod/valibot/arktype adapters all support it). The validator-only ' +
          'shape used by @pyreon/form is not enough for schema-stores — ' +
          'store needs the coerced parsed value, not just errors.',
      )
    }
    return parse as (value: unknown) => SchemaParseResult<T>
  }

  if (isStandardSchema(schema)) {
    return wrapStandardSchema<T>(schema, initial)
  }

  throw new Error(
    '[Pyreon] defineStore: `schema` must be a TypedSchemaAdapter (from ' +
      '@pyreon/validation) or a Standard Schema-compliant object (zod 3.24+, ' +
      'valibot 1.0+, arktype 2.0+, Effect Schema, etc.). ' +
      'See https://standardschema.dev/ for the spec.',
  )
}

/**
 * Convert a Standard Schema instance into a `SchemaParseResult` parser.
 * Synchronous only — rejects schemas whose `validate()` returns a Promise
 * by surfacing the Promise as a non-`ok` result (caller probes for this
 * and throws at `defineStore`-time).
 */
function wrapStandardSchema<T extends Record<string, unknown>>(
  schema: StandardSchemaShape<unknown>,
  _initial: T,
): (value: unknown) => SchemaParseResult<T> {
  return (value: unknown) => {
    try {
      const result = schema['~standard'].validate(value)
      // Async escape — caller rejects via Promise-detection.
      if (result instanceof Promise) {
        return result as unknown as SchemaParseResult<T>
      }
      const r = result as { value?: unknown; issues?: ReadonlyArray<{ message: string; path?: ReadonlyArray<string | number | symbol | { key: PropertyKey }> }> }
      if ('value' in r) {
        return { ok: true, value: r.value as T }
      }
      const issues = (r.issues ?? []).map((issue) => ({
        path: (issue.path ?? [])
          .map((p) => (typeof p === 'object' && p !== null ? String(p.key) : String(p)))
          .join('.'),
        message: issue.message,
      }))
      return { ok: false, issues }
    } catch (err) {
      return {
        ok: false,
        issues: [{ path: '', message: err instanceof Error ? err.message : String(err) }],
      }
    }
  }
}

/**
 * Format schema issues into a readable error message.
 */
function formatIssues(issues: SchemaIssue[], op: 'set' | 'patch' | 'init'): string {
  const lines = issues.slice(0, 5).map((i) => `  - ${i.path || '<root>'}: ${i.message}`)
  const more = issues.length > 5 ? `\n  ... and ${issues.length - 5} more` : ''
  return `[Pyreon] Schema validation failed (${op}):\n${lines.join('\n')}${more}`
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
export function defineStore<
  S,
  U extends Record<string, unknown> = Record<string, unknown>,
>(
  id: string,
  config: SchemaStoreConfig<S, U>,
): () => SchemaStoreApi<SignalsOf<InferSchema<S>> & U>

/**
 * Define a store with a unique id and a setup function.
 * Returns a hook that returns a `StoreApi<T>` with the user's state under `.store`
 * and framework methods (`patch`, `subscribe`, `onAction`, `reset`, `dispose`) at the top level.
 */
export function defineStore<T extends Record<string, unknown>>(
  id: string,
  setup: () => T,
): () => StoreApi<T>

export function defineStore(id: string, configOrSetup: unknown): () => StoreApi<Record<string, unknown>> {
  // ── Schema-mode dispatch ────────────────────────────────────────────────
  // Discriminator: 2nd arg is an object with a `schema` field.
  if (
    configOrSetup != null &&
    typeof configOrSetup === 'object' &&
    'schema' in configOrSetup
  ) {
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
): () => SchemaStoreApi<Record<string, unknown>> {
  const { schema, initial, setup: userSetup, onValidationError } = config

  // Resolve sync parse function (Tier A.1, A.2, or throw).
  const parse = extractParseFn(schema, initial as Record<string, unknown>)

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
      throw new Error('[Pyreon] defineStore: schema returned a Promise at runtime — async unsupported.')
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
  let apiRef: SchemaStoreApi<Record<string, unknown>> | null = null

  return function useSchemaStore(): SchemaStoreApi<Record<string, unknown>> {
    if (apiRef) return apiRef
    const inner = useInner() as StoreApi<Record<string, unknown>>
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
      reset() {
        const reParsed = parse(initial)
        if (!(reParsed instanceof Promise) && reParsed.ok) {
          innerPatch(reParsed.value as Record<string, unknown>)
        } else {
          inner.reset()
        }
      },
    } as SchemaStoreApi<Record<string, unknown>>

    return apiRef
  }
}

/**
 * Sentinel returned by `validateOrFail` when `onValidationError` suppresses
 * the throw — caller skips the write entirely.
 */
const SKIP_WRITE: Record<string, unknown> = Object.freeze({ __pyreon_skip_write__: true })

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
    if (registry.has(id)) return registry.get(id) as StoreApi<T>

    // Mount-N-stores baseline. Fires only on cache miss (cache hit short-circuits above)
    // so the counter measures FRESH store creations, not registry lookups.
    if (__DEV__) _countSink.__pyreon_count__?.('store.defineStore')

    const raw = setup()

    // Classify properties
    const signalKeys: string[] = []
    const actionKeys: string[] = []
    const initialValues = new Map<string, unknown>()

    for (const key of Object.keys(raw)) {
      const val = raw[key]
      if (isSignalLike(val)) {
        signalKeys.push(key)
        initialValues.set(key, val.peek())
      } else if (isComputedLike(val)) {
        // computed — skip, just pass through
      } else if (typeof val === 'function') {
        actionKeys.push(key)
      }
    }

    // ─── subscribe infrastructure ───────────────────────────────────────
    // Lazy Set allocation: most stores never get a user subscribe() call.
    // Initialise as null and allocate only on first add — for a 1k-store
    // mount that's 1000 fewer Set allocations per page boot.
    let subscribers: Set<SubscribeCallback> | null = null
    let patchInProgress = false
    let patchEvents: MutationInfo['events'] = []

    function getState(): Record<string, unknown> {
      const state: Record<string, unknown> = {}
      for (const key of signalKeys) {
        state[key] = (raw[key] as SignalLike).peek()
      }
      return state
    }

    function notifyDirect(key: string, oldValue: unknown, newValue: unknown) {
      if (patchInProgress) {
        patchEvents.push({ key, newValue, oldValue })
        return
      }
      if (subscribers === null || subscribers.size === 0) return
      const mutation: MutationInfo = {
        storeId: id,
        type: 'direct',
        events: [{ key, newValue, oldValue }],
      }
      const state = getState()
      for (const cb of subscribers) {
        // Fan-out per signal-write × subscriber. High count under stress
        // means user code is over-subscribing — collapse with `selector`
        // pattern or move state into a dedicated store.
        if (__DEV__) _countSink.__pyreon_count__?.('store.subscribeNotify')
        cb(mutation, state)
      }
    }

    // Subscribe to each signal for change detection
    const signalUnsubs: (() => void)[] = []
    for (const key of signalKeys) {
      const sig = raw[key] as SignalLike
      let prev = sig.peek()
      const unsub = sig.subscribe(() => {
        const next = sig.peek()
        const old = prev
        prev = next
        notifyDirect(key, old, next)
      })
      signalUnsubs.push(unsub)
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
        if (__DEV__) _countSink.__pyreon_count__?.('store.actionCall')

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
          if (__DEV__) _countSink.__pyreon_count__?.('store.actionListenerNotify')
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

    // ─── Build user store object ────────────────────────────────────────
    const userStore: Record<string, unknown> = {}

    for (const key of Object.keys(raw)) {
      if (actionKeys.includes(key)) {
        userStore[key] = wrapAction(key, raw[key] as (...args: any[]) => unknown)
      } else {
        userStore[key] = raw[key]
      }
    }

    // ─── Build StoreApi ─────────────────────────────────────────────────
    const api: StoreApi<T> = {
      store: userStore as T,

      id,

      get state() {
        return getState()
      },

      patch(partialOrFn: Record<string, unknown> | ((state: Record<string, any>) => void)) {
        patchInProgress = true
        patchEvents = []

        batch(() => {
          if (typeof partialOrFn === 'function') {
            // Functional form: pass an object with the actual signals so user calls .set()
            const signalMap: Record<string, any> = {}
            for (const key of signalKeys) {
              signalMap[key] = raw[key]
            }
            partialOrFn(signalMap)
          } else {
            // Object form: set values directly (skip reserved proto keys)
            for (const [key, value] of Object.entries(partialOrFn)) {
              if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
              if (signalKeys.includes(key)) {
                // Per-key write inside batched patch. Tracks batch-size
                // distribution; correlate with `reactivity.signalWrite`
                // — the two should match 1:1 on the object-form path.
                if (__DEV__) _countSink.__pyreon_count__?.('store.patchKey')
                ;(raw[key] as SignalLike).set(value)
              }
            }
          }
        })

        patchInProgress = false

        // Emit a single notification for the patch
        if (subscribers !== null && subscribers.size > 0 && patchEvents.length > 0) {
          const mutation: MutationInfo = {
            storeId: id,
            type: 'patch',
            events: patchEvents,
          }
          const state = getState()
          for (const cb of subscribers) {
            // Same fan-out counter as the direct-notify path; the patch
            // path emits ONCE per patch (not per key) thanks to the
            // batched flush, so this should equal the patch call count
            // multiplied by subscriber count.
            if (__DEV__) _countSink.__pyreon_count__?.('store.subscribeNotify')
            cb(mutation, state)
          }
        }
        patchEvents = []
      },

      subscribe(callback: SubscribeCallback, options?: { immediate?: boolean }): () => void {
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
          for (const [key, initial] of initialValues) {
            ;(raw[key] as SignalLike).set(initial)
          }
        })
      },

      dispose() {
        for (const unsub of signalUnsubs) unsub()
        signalUnsubs.length = 0
        subscribers?.clear()
        actionListeners?.clear()
        getRegistry().delete(id)
      },
    }

    // Run plugins — errors in one plugin should not break store creation,
    // but they must be visible in dev mode so developers can diagnose.
    // Fast path: most apps register zero plugins. Skipping the loop entirely
    // saves the iteration + try/catch frame allocation for every fresh
    // store creation in the common case.
    if (_plugins.length > 0) {
      for (const plugin of _plugins) {
        // O(stores × plugins). Likely target for further optimization —
        // the plugin chain runs uncached on every fresh store creation.
        // Big number under storePluginScale-1000 means caching the
        // plugin-init result per store-id is worth investigating.
        if (__DEV__) _countSink.__pyreon_count__?.('store.pluginRun')
        try {
          plugin(api as StoreApi<Record<string, unknown>>)
        } catch (err) {
          if (__DEV__) {
            // oxlint-disable-next-line no-console
            console.warn(`[Pyreon] Store plugin error for "${id}":`, err)
          }
        }
      }
    }

    registry.set(id, api)
    _notifyChange()
    return api
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Destroy a store by id so next call to useStore() re-runs setup. */
export function resetStore(id: string): void {
  getRegistry().delete(id)
  _notifyChange()
}

/** Destroy all stores — useful for SSR isolation and tests. */
export function resetAllStores(): void {
  getRegistry().clear()
  _notifyChange()
}
