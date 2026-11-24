/**
 * Svelte 5 state for the `maplist` scenario — the same model choices as the row
 * board (`bench-state.svelte.ts`), for the same reasons:
 *
 *  - the list is `$state.raw`: every structural write assigns a fresh array, so
 *    a deep proxy per row would be a tax the signal-per-field arms do not pay;
 *  - the two fields mutated in place (`label`, `done`) are `$state` class
 *    fields, one source per field per row — the fine-grained model the Pyreon
 *    and Solid arms give every row.
 */
export class SvelteMapRow {
  id: number
  label: string
  done: boolean

  constructor(id: number, label: string, done: boolean) {
    this.id = id
    this.label = $state(label)
    this.done = $state(done)
  }
}

let rows = $state.raw<SvelteMapRow[]>([])

export function getMapRows(): SvelteMapRow[] {
  return rows
}

export function setMapRows(next: SvelteMapRow[]): void {
  rows = next
}
