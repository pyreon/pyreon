/**
 * @pyreon/state-tree devtools introspection API.
 * Import: `import { ... } from "@pyreon/state-tree/devtools"`
 */

import { getSnapshot } from "./snapshot"

// Track active model instances (devtools-only, opt-in)
const _activeModels = new Map<string, WeakRef<object>>()
const _listeners = new Set<() => void>()

function _notify(): void {
  for (const listener of _listeners) listener()
}

/**
 * Register a model instance for devtools inspection.
 * Call this when creating instances you want visible in devtools.
 *
 * @example
 * const counter = Counter.create()
 * registerInstance("app-counter", counter)
 */
export function registerInstance(name: string, instance: object): void {
  _activeModels.set(name, new WeakRef(instance))
  _notify()
}

/**
 * Unregister a model instance.
 */
export function unregisterInstance(name: string): void {
  _activeModels.delete(name)
  _notify()
}

/**
 * Get all registered model instance names.
 * Automatically cleans up garbage-collected instances.
 */
export function getActiveModels(): string[] {
  for (const [name, ref] of _activeModels) {
    if (ref.deref() === undefined) _activeModels.delete(name)
  }
  return [..._activeModels.keys()]
}

/**
 * Get a model instance by name (or undefined if GC'd or not registered).
 */
export function getModelInstance(name: string): object | undefined {
  const ref = _activeModels.get(name)
  if (!ref) return undefined
  const instance = ref.deref()
  if (!instance) {
    _activeModels.delete(name)
    return undefined
  }
  return instance
}

/**
 * Get a snapshot of a registered model instance.
 */
export function getModelSnapshot(name: string): Record<string, unknown> | undefined {
  const instance = getModelInstance(name)
  if (!instance) return undefined
  return getSnapshot(instance)
}

/**
 * Subscribe to model registry changes. Returns unsubscribe function.
 */
export function onModelChange(listener: () => void): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

/** @internal — reset devtools registry (for tests). */
export function _resetDevtools(): void {
  _activeModels.clear()
  _listeners.clear()
}
