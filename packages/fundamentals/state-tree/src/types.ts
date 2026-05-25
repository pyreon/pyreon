import type { Signal } from '@pyreon/reactivity'

// ─── Model brand ──────────────────────────────────────────────────────────────

/** Property key stamped on every ModelDefinition to distinguish it from plain objects. */
export const MODEL_BRAND = '__pyreonMod' as const

// ─── State type helpers ───────────────────────────────────────────────────────

export type StateShape = Record<string, unknown>

/**
 * Resolve a state field type:
 * - ModelDefinition → the instance type it produces
 * - Anything else → as-is
 */
export type ResolveField<T> = T extends {
  readonly __pyreonMod: true
  create(initial?: any): infer I
}
  ? I
  : T

/** Map state shape to per-field signals. */
export type StateSignals<TState extends StateShape> = {
  readonly [K in keyof TState]: Signal<ResolveField<TState[K]>>
}

// ─── Schema-mode mutation helpers ────────────────────────────────────────────

/**
 * Validated mutation helpers exposed on schema-mode model instances and on
 * `self` inside schema-mode action / view factories. `$`-prefixed to avoid
 * colliding with user schema field names — `name`, `set`, `patch`, `reset`
 * are all plausible field names in a real schema.
 */
export interface SchemaModelHelpers<TState extends StateShape> {
  /** Replace the whole state. Validates via schema; throws on failure. */
  readonly $set: (next: TState) => void
  /** Shallow partial merge. Validates merged result via schema; throws on failure. */
  readonly $patch: (partial: Partial<TState>) => void
  /** Reset every signal to the parsed-initial value captured at `.create()` time. */
  readonly $reset: () => void
}

/**
 * `self` type inside actions / views. Includes state signals + all previously-
 * accumulated views/actions (from prior `.views()` / `.actions()` chain calls)
 * + schema helpers when schema mode is active. The `Record<string, any>` tail
 * keeps factories able to forward-reference each other without circular type
 * errors.
 */
export type ModelSelf<
  TState extends StateShape,
  TViews extends Record<string, unknown>,
  TActions extends Record<string, (...args: any[]) => any>,
  HasSchema extends boolean,
> = StateSignals<TState> &
  TViews &
  TActions &
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  (HasSchema extends true ? SchemaModelHelpers<TState> : {}) &
  Record<string, any>

/**
 * The public instance type returned by `.create()` and hooks. Includes
 * state signals + every chained `.views()` + every chained `.actions()` +
 * schema mutation helpers (when applicable).
 */
export type ModelInstance<
  TState extends StateShape,
  TViews extends Record<string, unknown> = Record<never, never>,
  TActions extends Record<string, (...args: any[]) => any> = Record<never, never>,
  HasSchema extends boolean = false,
> = StateSignals<TState> &
  TViews &
  TActions &
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  (HasSchema extends true ? SchemaModelHelpers<TState> : {})

/**
 * Extract the state type from a ModelDefinition.
 * Used by Snapshot to recursively resolve nested model types.
 *
 * `_typeState` is a phantom type-slot stamped on every ModelDefinition by
 * the model() factory — it carries the inferred `TState` type parameter
 * without runtime cost. Reading via `_config.state` no longer works
 * because `state` is optional (schema mode has no `state` field).
 */
type ExtractModelState<T> = T extends {
  readonly __pyreonMod: true
  readonly _typeState?: infer S
}
  ? S extends StateShape
    ? S
    : never
  : never

/**
 * Snapshot type: plain JS values (no signals, no model instances).
 * Nested model fields recursively produce their own typed snapshot.
 */
export type Snapshot<TState extends StateShape> = {
  [K in keyof TState]: TState[K] extends { readonly __pyreonMod: true }
    ? Snapshot<ExtractModelState<TState[K]>>
    : TState[K]
}

// ─── Patch ────────────────────────────────────────────────────────────────────

export interface Patch {
  op: 'replace'
  path: string
  value: unknown
}

export type PatchListener = (patch: Patch) => void

// ─── Middleware ───────────────────────────────────────────────────────────────

export interface ActionCall {
  /** Action name. */
  name: string
  /** Arguments passed to the action. */
  args: unknown[]
  /** JSON-pointer-style path, e.g. `"/inc"`. */
  path: string
}

export type MiddlewareFn = (call: ActionCall, next: (nextCall: ActionCall) => unknown) => unknown

// ─── Instance metadata ────────────────────────────────────────────────────────

export interface InstanceMeta {
  stateKeys: string[]
  patchListeners: Set<PatchListener>
  middlewares: MiddlewareFn[]
  emitPatch(patch: Patch): void
}
