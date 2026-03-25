import { count, max, min, sum } from "./aggregation"
import {
  chunk,
  filter,
  find,
  flatten,
  groupBy,
  keyBy,
  map,
  sortBy,
  take,
  uniqBy,
} from "./collections"
import { pipe } from "./pipe"
import { search } from "./search"
import { debounce, throttle } from "./timing"

export type { KeyOf, ReadableSignal } from "./types"

/**
 * Signal-aware reactive transforms.
 *
 * Every function is overloaded:
 * - `Signal<T[]>` input → returns `Computed<R>` (reactive)
 * - `T[]` input → returns `R` (static)
 *
 * @example
 * ```ts
 * import { rx } from "@pyreon/rx"
 *
 * const users = signal<User[]>([])
 * const active = rx.filter(users, u => u.active)      // Computed<User[]>
 * const sorted = rx.sortBy(active, "name")             // Computed<User[]>
 * const top10 = rx.take(sorted, 10)                    // Computed<User[]>
 *
 * // Or pipe:
 * const result = rx.pipe(users,
 *   items => items.filter(u => u.active),
 *   items => items.sort((a, b) => a.name.localeCompare(b.name)),
 *   items => items.slice(0, 10),
 * )
 * ```
 */
export const rx = {
  // Collections
  filter,
  map,
  sortBy,
  groupBy,
  keyBy,
  uniqBy,
  take,
  chunk,
  flatten,
  find,

  // Aggregation
  count,
  sum,
  min,
  max,

  // Timing
  debounce,
  throttle,

  // Search
  search,

  // Pipe
  pipe,
} as const

// Also export individual functions for tree-shaking
export {
  chunk,
  count,
  debounce,
  filter,
  find,
  flatten,
  groupBy,
  keyBy,
  map,
  max,
  min,
  pipe,
  search,
  sortBy,
  sum,
  take,
  throttle,
  uniqBy,
}
