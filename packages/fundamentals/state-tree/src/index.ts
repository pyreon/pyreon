// ─── Core ─────────────────────────────────────────────────────────────────────

import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/state-tree
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/state-tree', '0.24.6', import.meta.url)

export type { ModelDefinition } from './model'
export { model, resetAllHooks, resetHook } from './model'

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export { applySnapshot, getSnapshot } from './snapshot'

// ─── Patches ─────────────────────────────────────────────────────────────────

export { applyPatch, onPatch } from './patch'

// ─── Middleware ───────────────────────────────────────────────────────────────

export { addMiddleware } from './middleware'

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
} from './types'
