/**
 * Svelte 5 shared state for the effect-heavy-list scenario.
 *
 * Deep `$state` on an array of per-row holders — NOT `$state.raw`. The rows are
 * MUTATED field-by-field (`rows[i].value = n`), never replaced wholesale, which
 * is precisely the case the deep proxy exists for and the same reasoning
 * `tree-state.svelte.ts` documents. `$state.raw` here would be the WRONG
 * opt-out: it would make a single-row write invisible, so the `update one` op
 * could not be expressed at all.
 */
import { EFFECT_ROWS } from './scenario-graph-shared'

export interface FxRowState {
  value: number
}

export const rows = $state<FxRowState[]>(
  Array.from({ length: EFFECT_ROWS }, () => ({ value: -1 })),
)

export function setRow(i: number, v: number): void {
  ;(rows[i] as FxRowState).value = v
}

export function setAll(values: number[]): void {
  for (let i = 0; i < values.length; i++) {
    ;(rows[i] as FxRowState).value = values[i] as number
  }
}
