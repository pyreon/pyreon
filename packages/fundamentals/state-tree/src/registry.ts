import type { InstanceMeta } from "./types"

/**
 * WeakMap from every model instance object → its internal metadata.
 * Shared across patch, middleware, and snapshot modules.
 */
export const instanceMeta = new WeakMap<object, InstanceMeta>()

/** Returns true when a value is a model instance (has metadata registered). */
export function isModelInstance(value: unknown): boolean {
  return value != null && typeof value === "object" && instanceMeta.has(value as object)
}
