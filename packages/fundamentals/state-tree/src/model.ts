import type { SchemaIssue, SchemaParseResult } from '@pyreon/validation'
import { extractParseFn, formatIssues } from '@pyreon/validation'
import { createInstance } from './instance'
import type {
  ModelInstance,
  ModelSelf,
  Snapshot,
  StateShape,
} from './types'
import { MODEL_BRAND } from './types'

// ─── Hook registry ────────────────────────────────────────────────────────────

// Module-level singleton registry for `asHook()` — isolated per package import.
// Use `resetHook(id)` or `resetAllHooks()` to clear entries (useful for tests / HMR).
const _hookRegistry = new Map<string, unknown>()

/** Destroy a hook singleton by id so next call re-creates the instance. */
export function resetHook(id: string): void {
  _hookRegistry.delete(id)
}

/** Destroy all hook singletons. */
export function resetAllHooks(): void {
  _hookRegistry.clear()
}

// ─── Config shapes (state OR schema, mutually exclusive) ─────────────────────

/**
 * Plain-state model config. State defaults live in `state`; `.create(initial?)`
 * accepts partial overrides.
 */
export interface PlainStateConfig<TState extends StateShape> {
  readonly state: TState
}

/**
 * Schema-driven model config. `schema` is a `TypedSchemaAdapter` (from
 * `@pyreon/validation`) or a Standard Schema-compliant instance. `initial`
 * provides the default snapshot; `.create(initial?)` can override.
 * `onValidationError`, if provided, suppresses throw on validation failure.
 */
export interface SchemaConfig<S> {
  readonly schema: S
  readonly initial?: unknown
  readonly onValidationError?: (issues: SchemaIssue[], op: string) => void
}

// ─── Internal config carried on `_config` ────────────────────────────────────

/**
 * @internal — the merged, normalized configuration stored on every
 * `ModelDefinition`. Schema mode populates `_parseFn` + `_parsedInitial`;
 * plain mode leaves them undefined.
 */
export interface NormalizedConfig<TState extends StateShape> {
  /** Plain-mode default state shape (undefined in schema mode). */
  readonly state?: TState
  /** Schema-mode parser (undefined in plain mode). */
  readonly _parseFn?: (value: unknown) => SchemaParseResult<TState>
  /** Schema-mode default initial value (undefined in plain mode). */
  readonly _parsedInitial?: TState
  /** Schema-mode validation error handler (undefined in plain mode). */
  readonly _onValidationError?: (issues: SchemaIssue[], op: string) => void
  /** Ordered list of view factories (always an array, possibly empty). */
  readonly viewFactories: ReadonlyArray<(self: any) => Record<string, unknown>>
  /** Ordered list of action factories (always an array, possibly empty). */
  readonly actionFactories: ReadonlyArray<
    (self: any) => Record<string, (...args: any[]) => any>
  >
}

// ─── ModelDefinition ──────────────────────────────────────────────────────────

/**
 * The chainable builder returned by `model()`. Use `.views(f)` / `.actions(f)`
 * to add layers (chainable, accumulating onto `self`); `.create(initial?)` to
 * instantiate; `.asHook(id)` for a singleton hook.
 *
 * Type parameters:
 * - `TState` — the underlying value shape (raw, not wrapped in signals)
 * - `TViews` — accumulated `.views(...)` returns (unioned across chain)
 * - `TActions` — accumulated `.actions(...)` returns (unioned across chain)
 * - `HasSchema` — whether schema mode is active (adds `set`/`patch`/`reset`)
 */
export class ModelDefinition<
  TState extends StateShape,
  TViews extends Record<string, unknown> = Record<never, never>,
  TActions extends Record<string, (...args: any[]) => any> = Record<never, never>,
  HasSchema extends boolean = false,
> {
  /** Brand used to identify ModelDefinition objects at runtime (without instanceof). */
  readonly [MODEL_BRAND] = true as const

  /**
   * Phantom type-slot carrying the inferred `TState` type parameter.
   * Read by `ExtractModelState<T>` in `types.ts`; never set at runtime.
   * `?: undefined` means the property is structurally optional and absent
   * at runtime, but TS still infers the type when this slot is checked
   * in a conditional.
   */
  readonly _typeState?: TState

  /** @internal — exposed so nested instance creation can read it. */
  readonly _config: NormalizedConfig<TState>

  /** @internal — only used by the static `model()` factory + chain methods. */
  constructor(config: NormalizedConfig<TState>) {
    this._config = config
  }

  /**
   * Add a layer of derived values. Chainable — each subsequent `.views(f)`
   * call sees the previously-accumulated views and actions on `self`. The
   * factory should return an object of `() => T` functions (often plain
   * arrow functions reading signals; wrap in `computed()` if you need
   * memoization across reads).
   *
   * @example
   * ```ts
   * model({ state: { count: 0 } })
   *   .views((self) => ({ doubled: () => self.count() * 2 }))
   *   .views((self) => ({ quadrupled: () => self.doubled() * 2 }))  // sees doubled
   * ```
   */
  views<V extends Record<string, unknown>>(
    factory: (self: ModelSelf<TState, TViews, TActions, HasSchema>) => V,
  ): ModelDefinition<TState, TViews & V, TActions, HasSchema> {
    return new ModelDefinition<TState, TViews & V, TActions, HasSchema>({
      ...this._config,
      viewFactories: [...this._config.viewFactories, factory as never],
    })
  }

  /**
   * Add a layer of action methods. Chainable — each subsequent `.actions(f)`
   * call sees the previously-accumulated views and actions on `self`.
   * Actions may be `async`; the returned `ModelInstance` method preserves
   * the Promise return type so `await u.fetchPosts()` works end-to-end.
   * Middleware is invoked around every action call (including async).
   *
   * @example
   * ```ts
   * model({ state: { count: 0 } })
   *   .actions((self) => ({ inc: () => self.count.update(n => n + 1) }))
   *   .actions((self) => ({ inc2: () => { self.inc(); self.inc() } }))  // sees inc
   * ```
   */
  actions<A extends Record<string, (...args: any[]) => any>>(
    factory: (self: ModelSelf<TState, TViews, TActions, HasSchema>) => A,
  ): ModelDefinition<TState, TViews, TActions & A, HasSchema> {
    return new ModelDefinition<TState, TViews, TActions & A, HasSchema>({
      ...this._config,
      actionFactories: [...this._config.actionFactories, factory as never],
    })
  }

  /**
   * Create a new independent model instance. Pass a partial snapshot to
   * override defaults (plain mode) or to provide / override the initial
   * value (schema mode).
   *
   * @example
   * ```ts
   * const counter = Counter.create({ count: 5 })
   * ```
   */
  create(
    initial?: Partial<Snapshot<TState>>,
  ): ModelInstance<TState, TViews, TActions, HasSchema> {
    return createInstance(this._config, initial ?? {}) as never
  }

  /**
   * Returns a hook function that always returns the same singleton instance
   * for the given `id` — Pinia / Zustand style.
   *
   * @example
   * ```ts
   * const useCounter = Counter.asHook("app-counter")
   * const store = useCounter()
   * ```
   */
  asHook(id: string): () => ModelInstance<TState, TViews, TActions, HasSchema> {
    return () => {
      if (!_hookRegistry.has(id)) {
        _hookRegistry.set(id, this.create())
      }
      return _hookRegistry.get(id) as ModelInstance<
        TState,
        TViews,
        TActions,
        HasSchema
      >
    }
  }
}

// ─── model() factory ──────────────────────────────────────────────────────────

/**
 * Define a reactive model. Returns a chainable {@link ModelDefinition} —
 * use `.views(f)` / `.actions(f)` to add derived values and methods, then
 * `.create(initial?)` to instantiate or `.asHook(id)` for a singleton.
 *
 * Two modes (mutually exclusive — pick one based on whether you have a
 * validation schema):
 *
 * **Schema mode** — types and runtime validation inferred from a schema:
 * ```ts
 * import { zodSchema } from '@pyreon/validation'
 * import { z } from 'zod'
 *
 * const User = model({
 *   schema: zodSchema(z.object({ name: z.string(), age: z.number() })),
 *   initial: { name: '', age: 0 },
 * })
 *   .views((self) => ({ greet: () => `Hi, ${self.name()}` }))
 *   .actions((self) => ({
 *     rename: (next: string) => self.patch({ name: next }),
 *     async fetchProfile() { /\* async out of the box \*\/ },
 *   }))
 * ```
 *
 * **Plain mode** — state shape from a literal object:
 * ```ts
 * const Counter = model({ state: { count: 0 } })
 *   .views((self) => ({ doubled: () => self.count() * 2 }))
 *   .actions((self) => ({ inc: () => self.count.update(n => n + 1) }))
 * ```
 */
export function model<TState extends StateShape>(
  config: PlainStateConfig<TState>,
): ModelDefinition<TState, Record<never, never>, Record<never, never>, false>
export function model<S>(
  config: SchemaConfig<S>,
): ModelDefinition<
  S extends { readonly _infer: infer T extends StateShape }
    ? T
    : S extends {
          readonly '~standard': {
            readonly types: {
              readonly output: infer O extends StateShape
            }
          }
        }
      ? O
      : StateShape,
  Record<never, never>,
  Record<never, never>,
  true
>
export function model(
  config:
    | { state: StateShape }
    | {
        schema: unknown
        initial?: unknown
        onValidationError?: (issues: SchemaIssue[], op: string) => void
      },
): ModelDefinition<StateShape, Record<never, never>, Record<never, never>, boolean> {
  if ('schema' in config && config.schema !== undefined) {
    const parseFn = extractParseFn<StateShape>(config.schema)

    // Validate `initial` once at model-definition time (if provided). This
    // catches bad-shape initials early and writes the PARSED value (with
    // schema defaults / transforms applied) into the captured initial.
    let parsedInitial: StateShape | undefined
    if (config.initial !== undefined) {
      const result = parseFn(config.initial)
      if (result instanceof Promise) {
        throw new Error(
          '[Pyreon] model({ schema }): schema returned a Promise from `parse`. ' +
            'Async schemas are unsupported — use a synchronous validator ' +
            '(zod.safeParse, valibot.safeParse, etc.). For async refinements, ' +
            'use @pyreon/form instead.',
        )
      }
      if (!result.ok) {
        const message = formatIssues(result.issues, 'init')
        if (config.onValidationError) {
          config.onValidationError(result.issues, 'init')
          // Fall through with no parsed initial — `.create()` must supply one.
        } else {
          throw new Error(message)
        }
      } else {
        parsedInitial = result.value
      }
    }

    // Use a builder pattern to avoid `undefined` assignment to optional
    // fields under `exactOptionalPropertyTypes: true`.
    const cfg: NormalizedConfig<StateShape> = {
      _parseFn: parseFn,
      viewFactories: [],
      actionFactories: [],
      ...(parsedInitial !== undefined ? { _parsedInitial: parsedInitial } : {}),
      ...(config.onValidationError
        ? { _onValidationError: config.onValidationError }
        : {}),
    }
    return new ModelDefinition(cfg)
  }

  // Plain-state mode.
  if (!('state' in config)) {
    throw new Error(
      '[Pyreon] model({}): config must carry either `state` (plain mode) or ' +
        '`schema` (schema mode). Neither was provided.',
    )
  }

  return new ModelDefinition({
    state: (config as { state: StateShape }).state,
    viewFactories: [],
    actionFactories: [],
  })
}
