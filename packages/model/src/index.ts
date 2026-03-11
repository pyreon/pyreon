// ─── Core ─────────────────────────────────────────────────────────────────────

export type { ModelDefinition } from "./model"
export { model } from "./model"

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export { applySnapshot, getSnapshot } from "./snapshot"

// ─── Patches ─────────────────────────────────────────────────────────────────

export { onPatch } from "./patch"

// ─── Middleware ───────────────────────────────────────────────────────────────

export { addMiddleware } from "./middleware"

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  ActionCall,
  MiddlewareFn,
  ModelInstance,
  ModelSelf,
  Patch,
  PatchListener,
  Snapshot,
  StateShape,
} from "./types"
