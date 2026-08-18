/**
 * Svelte 5 shared state for the dbmon scenario.
 *
 * `$state.raw`, deliberately — same reasoning as `bench-state.svelte.ts`: the
 * tick array is REPLACED wholesale every update and no sample object is ever
 * mutated field-by-field, which is exactly the case Svelte's own docs give for
 * opting out of the deep proxy. A plain `$state` would allocate a proxy per
 * sample per tick (100 rows × 5 cells), a tax no other framework in this
 * scenario pays, and would repeat the handicap PR #2878 removed from the main
 * suite.
 */
import type { DbSample } from './scenario-shared'

let rawTick = $state.raw<DbSample[]>([])

/** Read the current tick — reactive: `{#each getTick() …}` re-runs on replace. */
export function getTick(): DbSample[] {
  return rawTick
}

/** Replace the tick wholesale (the only supported write). */
export function setTick(next: DbSample[]): void {
  rawTick = next
}
