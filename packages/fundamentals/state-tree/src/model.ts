import type { Computed, Signal } from "@pyreon/reactivity"
import { createInstance, type ModelConfig } from "./instance"
import type { ModelInstance, Snapshot, StateShape } from "./types"
import { MODEL_BRAND } from "./types"

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

// ─── ModelDefinition ──────────────────────────────────────────────────────────

/**
 * Returned by `model()`. Call `.create()` for instances or `.asHook(id)` for
 * a Zustand-style singleton hook.
 */
export class ModelDefinition<
  TState extends StateShape,
  TActions extends Record<string, (...args: any[]) => any>,
  TViews extends Record<string, Signal<any> | Computed<any>>,
> {
  /** Brand used to identify ModelDefinition objects at runtime (without instanceof). */
  readonly [MODEL_BRAND] = true as const

  /** @internal — exposed so nested instance creation can read it. */
  readonly _config: ModelConfig<TState, TActions, TViews>

  constructor(config: ModelConfig<TState, TActions, TViews>) {
    this._config = config
  }

  /**
   * Create a new independent model instance.
   * Pass a partial snapshot to override defaults.
   *
   * @example
   * const counter = Counter.create({ count: 5 })
   */
  create(initial?: Partial<Snapshot<TState>>): ModelInstance<TState, TActions, TViews> {
    return createInstance(this._config, initial ?? {})
  }

  /**
   * Returns a hook function that always returns the same singleton instance
   * for the given `id` — Zustand / Pinia style.
   *
   * @example
   * const useCounter = Counter.asHook("app-counter")
   * // Any call to useCounter() returns the same instance.
   * const store = useCounter()
   */
  asHook(id: string): () => ModelInstance<TState, TActions, TViews> {
    return () => {
      if (!_hookRegistry.has(id)) {
        _hookRegistry.set(id, this.create())
      }
      return _hookRegistry.get(id) as ModelInstance<TState, TActions, TViews>
    }
  }
}

// ─── model() factory ──────────────────────────────────────────────────────────

/**
 * Define a reactive model with state, views, and actions.
 *
 * - **state** — plain JS object; each key becomes a `Signal<T>` on the instance.
 * - **views** — factory receiving `self`; return computed signals for derived state.
 * - **actions** — factory receiving `self`; return functions that mutate state.
 *
 * Use nested `ModelDefinition` values in `state` to compose models.
 *
 * @example
 * const Counter = model({
 *   state: { count: 0 },
 *   views: (self) => ({
 *     doubled: computed(() => self.count() * 2),
 *   }),
 *   actions: (self) => ({
 *     inc:   () => self.count.update(c => c + 1),
 *     reset: () => self.count.set(0),
 *   }),
 * })
 *
 * const c = Counter.create({ count: 5 })
 * c.count()    // 5
 * c.inc()
 * c.doubled()  // 12
 */
export function model<
  TState extends StateShape,
  TActions extends Record<string, (...args: any[]) => any> = Record<never, never>,
  TViews extends Record<string, Signal<any> | Computed<any>> = Record<never, never>,
>(config: ModelConfig<TState, TActions, TViews>): ModelDefinition<TState, TActions, TViews> {
  return new ModelDefinition(config)
}
