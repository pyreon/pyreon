// ─── Core ─────────────────────────────────────────────────────────────────────

export { model } from "./model"
export type { ModelDefinition } from "./model"

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export { getSnapshot, applySnapshot } from "./snapshot"

// ─── Patches ─────────────────────────────────────────────────────────────────

export { onPatch } from "./patch"

// ─── Middleware ───────────────────────────────────────────────────────────────

export { addMiddleware } from "./middleware"

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  StateShape,
  ModelInstance,
  ModelSelf,
  Snapshot,
  Patch,
  PatchListener,
  ActionCall,
  MiddlewareFn,
} from "./types"
