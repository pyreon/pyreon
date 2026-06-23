import type { Signal } from '@pyreon/reactivity'

// ─── Model brand ──────────────────────────────────────────────────────────────

/** Property key stamped on every ModelDefinition to distinguish it from plain objects. */
export const MODEL_BRAND = '__pyreonMod' as const

// ─── State type helpers ───────────────────────────────────────────────────────

export type StateShape = Record<string, unknown>

// ─── Schema → state-type inference ─────────────────────────────────────────────

/**
 * Resolve a schema-mode model's state type from the `schema` config field —
 * the spine of "the model is strictly typed from its schema." Three arms, in
 * order:
 *
 * 1. `_infer` — the `@pyreon/validation` `TypedSchemaAdapter` (`zodSchema(...)`).
 * 2. The output type extracted directly from a [Standard Schema](https://standardschema.dev)
 *    `~standard.validate` return — so ANY spec-compliant schema strictly types
 *    `model({ schema })` WITHOUT an adapter wrapper: `@pyreon/validate`'s
 *    `s.object`, a raw `z.object`, valibot, arktype. We read `O` out of the
 *    success branch (`{ value: O }`) of `validate`'s (possibly-`Promise`)
 *    return rather than the optional `~standard.types` slot — `@pyreon/validate`
 *    omits that slot, so a `types`-based match would silently fall through.
 *    The loose `(value: any) => infer R` shape matches every validator's
 *    `~standard` regardless of its issue-array / version-literal specifics
 *    (a stricter local interface did NOT structurally match — proven by probe).
 * 3. Fallback to `StateShape` (untyped) — strictly no worse than not matching.
 */
export type InferSchemaState<S> = S extends {
  readonly _infer: infer T extends StateShape
}
  ? T
  : S extends {
        readonly '~standard': {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          readonly validate: (value: any) => infer R
        }
      }
    ? Extract<Awaited<R>, { readonly value: unknown }> extends {
        readonly value: infer O
      }
      ? O extends StateShape
        ? O
        : StateShape
      : StateShape
    : StateShape

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
 * Recursive partial — every property optional at every depth. Arrays
 * and class instances replace (not merge), only plain objects deep-merge.
 * Parallel to `@pyreon/store`'s `DeepPartial`.
 */
export type DeepPartial<T> = T extends ReadonlyArray<unknown>
  ? T
  : T extends object
    ? { readonly [K in keyof T]?: DeepPartial<T[K]> }
    : T

/**
 * Validated mutation helpers exposed on schema-mode model instances and on
 * `self` inside schema-mode action / view factories. Bare names (matching
 * `@pyreon/store`'s `SchemaStoreApi`). Schema field names CANNOT collide
 * with these reserved names — `model({ schema })` throws at `.create()`
 * time if your schema declares a field named `set` / `patch` /
 * `deepPatch` / `update` / `reset`.
 *
 * Five helpers covering the canonical mutation shapes:
 *
 * - **`set(full)`** — replace the whole state atomically. Requires the
 *   full schema shape; throws on shape mismatch.
 * - **`patch(partial)`** — shallow merge of top-level fields. Sibling
 *   keys at depth ≥ 2 inside an object are NOT preserved (the whole
 *   object is replaced).
 * - **`deepPatch(partial)`** — recursive merge of nested plain objects.
 *   Arrays and class instances (Date, Map, Set) REPLACE; only plain
 *   objects recurse.
 * - **`update(key, fn)`** — transform a single top-level field via
 *   callback. Covers add / remove / filter / map / object-key-delete
 *   patterns in one method.
 * - **`reset()`** — restore every signal to the parsed-initial value
 *   captured at `.create()` time.
 *
 * All five validate the merged result via schema before writing to
 * signals (or invoke `onValidationError` if configured). Direct signal
 * writes (`self.field.set(v)`) bypass validation — the documented
 * escape hatch.
 */
export interface SchemaModelHelpers<TState extends StateShape> {
  /** Replace the whole state. Validates via schema; throws on failure. */
  readonly set: (next: TState) => void
  /** Shallow partial merge. Validates merged result via schema; throws on failure. */
  readonly patch: (partial: Partial<TState>) => void
  /**
   * Recursively merge a partial state. Plain objects recurse; arrays /
   * class instances REPLACE. Validates merged result via schema.
   */
  readonly deepPatch: (partial: DeepPartial<TState>) => void
  /**
   * Transform a single top-level field via callback. Validates the
   * resulting merged state via schema. Key is constrained to `keyof
   * TState & string`; transformer is `(current: unknown) => unknown`
   * (cast at call site — schema-inferred narrowing is a future
   * refinement, parallel to `@pyreon/store`'s `update`).
   */
  readonly update: <K extends keyof TState & string>(
    key: K,
    transformer: (current: unknown) => unknown,
  ) => void
  /** Reset every signal to the parsed-initial value captured at `.create()` time. */
  readonly reset: () => void
}

/**
 * Reserved key names in schema mode — schema field names cannot collide
 * with these mutation helper names. Exposed for downstream consumers
 * that want to validate field names at design time (e.g. linting).
 */
export const RESERVED_SCHEMA_HELPER_KEYS = [
  'set',
  'patch',
  'deepPatch',
  'update',
  'reset',
] as const

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
