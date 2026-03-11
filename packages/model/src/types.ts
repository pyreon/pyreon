import type { Computed, Signal } from "@pyreon/reactivity"

// ─── Model brand ──────────────────────────────────────────────────────────────

/** Property key stamped on every ModelDefinition to distinguish it from plain objects. */
export const MODEL_BRAND = "__pyreonMod" as const

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

/**
 * `self` type inside actions / views:
 * strongly typed for state signals, `any` for actions and views so that
 * actions can call each other without circular type issues.
 */
export type ModelSelf<TState extends StateShape> = StateSignals<TState> & Record<string, any>

/** The public instance type returned by `.create()` and hooks. */
export type ModelInstance<
  TState extends StateShape,
  TActions extends Record<string, (...args: any[]) => any>,
  TViews extends Record<string, Signal<any> | Computed<any>>,
> = StateSignals<TState> & TActions & TViews

/**
 * Snapshot type: plain JS values (no signals, no model instances).
 * Nested model fields become `Record<string, unknown>` (their own snapshot shape).
 */
export type Snapshot<TState extends StateShape> = {
  [K in keyof TState]: TState[K] extends { readonly __pyreonMod: true }
    ? Record<string, unknown>
    : TState[K]
}

// ─── Patch ────────────────────────────────────────────────────────────────────

export interface Patch {
  op: "replace"
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

export type MiddlewareFn = (call: ActionCall, next: (call: ActionCall) => unknown) => unknown

// ─── Instance metadata ────────────────────────────────────────────────────────

export interface InstanceMeta {
  stateKeys: string[]
  patchListeners: Set<PatchListener>
  middlewares: MiddlewareFn[]
  emitPatch(patch: Patch): void
}
