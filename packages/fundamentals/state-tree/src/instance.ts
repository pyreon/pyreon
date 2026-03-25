import type { Computed, Signal } from "@pyreon/reactivity"
import { signal } from "@pyreon/reactivity"
import { runAction } from "./middleware"
import { onPatch, trackedSignal } from "./patch"
import { instanceMeta } from "./registry"
import type { InstanceMeta, ModelInstance, Snapshot, StateShape } from "./types"
import { MODEL_BRAND } from "./types"

// ─── Model definition detection ───────────────────────────────────────────────

interface AnyModelDef {
  readonly [MODEL_BRAND]: true
  readonly _config: ModelConfig<
    StateShape,
    Record<string, (...args: unknown[]) => unknown>,
    Record<string, Signal<unknown>>
  >
}

function isModelDef(v: unknown): v is AnyModelDef {
  if (v == null || typeof v !== "object") return false
  return (v as Record<string, unknown>)[MODEL_BRAND] === true
}

// ─── Config shape ─────────────────────────────────────────────────────────────

export interface ModelConfig<TState extends StateShape, TActions, TViews> {
  state: TState
  views?: (self: any) => TViews
  actions?: (self: any) => TActions
}

// ─── createInstance ───────────────────────────────────────────────────────────

/**
 * Create a live model instance from a config + optional initial snapshot.
 * Called by `ModelDefinition.create()`.
 */
export function createInstance<
  TState extends StateShape,
  TActions extends Record<string, (...args: any[]) => any>,
  TViews extends Record<string, Signal<any> | Computed<any>>,
>(
  config: ModelConfig<TState, TActions, TViews>,
  initial: Partial<Snapshot<TState>>,
): ModelInstance<TState, TActions, TViews> {
  // Raw object that will become the instance.
  const instance: Record<string, unknown> = {}

  // Metadata for this instance.
  const meta: InstanceMeta = {
    stateKeys: [],
    patchListeners: new Set(),
    middlewares: [],
    emitPatch(patch) {
      // Guard avoids iterating an empty Set on the hot signal-write path.
      if (this.patchListeners.size === 0) return
      for (const listener of this.patchListeners) listener(patch)
    },
  }
  instanceMeta.set(instance, meta)

  // `self` is a live proxy so that actions/views always see the final
  // (fully-populated) instance — including wrapped actions added later.
  const self = new Proxy(instance, {
    get(_, k) {
      return instance[k as string]
    },
  })

  // ── 1. State signals ──────────────────────────────────────────────────────
  for (const [key, defaultValue] of Object.entries(config.state)) {
    meta.stateKeys.push(key)
    const path = `/${key}`
    const initValue: unknown =
      key in initial ? (initial as Record<string, unknown>)[key] : undefined

    let rawSig: Signal<unknown>

    if (isModelDef(defaultValue)) {
      // Nested model — create its instance from the supplied snapshot (or defaults).
      const nestedInstance = createInstance(
        defaultValue._config,
        (initValue as Record<string, unknown>) ?? {},
      )
      rawSig = signal(nestedInstance)

      // Propagate nested patches upward with the key as path prefix.
      onPatch(nestedInstance, (patch) => {
        meta.emitPatch({ ...patch, path: path + patch.path })
      })
    } else {
      rawSig = signal(initValue !== undefined ? initValue : defaultValue)
    }

    const tracked = trackedSignal(
      rawSig,
      path,
      (p) => meta.emitPatch(p),
      () => meta.patchListeners.size > 0,
    )
    instance[key] = tracked
  }

  // ── 2. Views ──────────────────────────────────────────────────────────────
  if (config.views) {
    const views = config.views(self)
    for (const [key, view] of Object.entries(views as Record<string, unknown>)) {
      instance[key] = view
    }
  }

  // ── 3. Actions (wrapped with middleware runner) ───────────────────────────
  if (config.actions) {
    const rawActions = config.actions(self) as Record<string, (...args: unknown[]) => unknown>
    for (const [key, actionFn] of Object.entries(rawActions)) {
      instance[key] = (...args: unknown[]) => runAction(meta, key, actionFn, args)
    }
  }

  return instance as ModelInstance<TState, TActions, TViews>
}
