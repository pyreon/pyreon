// ─── Core ─────────────────────────────────────────────────────────────────────

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/state-tree
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

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
  DeepPartial,
  MiddlewareFn,
  ModelInstance,
  ModelSelf,
  Patch,
  PatchListener,
  SchemaModelHelpers,
  Snapshot,
  StateShape,
} from './types'
