/**
 * Fast FNV-1a non-cryptographic hash. Returns base-36 string for compact class names.
 *
 * 32-bit hash space → ~4.3 billion unique values. Collision probability is
 * negligible for typical applications (< 10,000 unique CSS rules).
 */

/** FNV-1a offset basis — starting state for streaming hash. */
export const HASH_INIT = 2166136261

const FNV_PRIME = 16777619

/**
 * Feed a string segment into the running hash state.
 * Streaming: hashUpdate(hashUpdate(HASH_INIT, 'ab'), 'cd') === hash('abcd').
 */
export const hashUpdate = (init: number, str: string): number => {
  let h = init
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME)
  }
  return h
}

/** Finalize a hash state into a base-36 class name suffix. */
export const hashFinalize = (h: number): string => (h >>> 0).toString(36)

/** Hash a complete string in one shot. Returns base-36 string. */
export const hash = (str: string): string => hashFinalize(hashUpdate(HASH_INIT, str))
