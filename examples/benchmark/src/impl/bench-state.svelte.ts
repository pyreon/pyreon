/**
 * Svelte 5 shared reactive state (runes).
 *
 * `.svelte.ts` extension tells the Svelte compiler to transform `$state`
 * runes outside of a `.svelte` component file.
 *
 * ## `rows` is `$state.raw`, deliberately
 *
 * A plain `$state` array is a DEEP proxy: Svelte proxies the array and then
 * each row object as the keyed `{#each}` touches it. For `create 10,000` and
 * `append 1k→10k` that is 10,000 proxy allocations per timed run — a tax
 * Pyreon and Solid do not pay, and it inflated exactly the two multipliers
 * this suite publishes most loudly ("2.4–3.0× at bulk-create", "3.2–4.1× on
 * Svelte append").
 *
 * `$state.raw` is Svelte's own documented opt-out for a value that is
 * REPLACED wholesale rather than mutated element-by-element — which is
 * precisely this workload: every write to the LIST assigns a fresh array. The
 * one per-row field that IS mutated in place (`label`) carries its own
 * `$state` (see `SvelteRow` below), so it needs no deep proxy either. This is
 * what a Svelte author optimising this table would write, so it is what the
 * benchmark must measure.
 *
 * Raw state cannot be exported as a reassignable `let` (the compiler rejects
 * reassigning an imported binding), hence the accessor pair. `selectedId`
 * stays a plain `$state` — it is one scalar, with no proxy cost worth avoiding.
 */
/**
 * ## `label` is per-row `$state`, deliberately
 *
 * The row list is replaced wholesale, but a row's LABEL is mutated in place by
 * `partial update (every 10th)`. The idiomatic Svelte 5 model for a mutable
 * field on an otherwise-immutable record is a `$state` class field — the same
 * fine-grained per-row source Pyreon (`signal`) and Solid (`createSignal`)
 * give every row, and the shape the krausest `svelte-keyed` (v5) entry uses.
 * `{row.label}` in the `{#each}` then subscribes to THAT row only, so a
 * partial update touches 100 text nodes instead of re-running the keyed each
 * over a rebuilt 1,000-row array (what the previous `{ ...row, label }` +
 * wholesale-replace arm measured — a handicap no Svelte author would write).
 *
 * The constructor-assigned `$state` form compiles to one private source per
 * instance with a getter/setter pair (verified with `svelte/compiler`
 * `compileModule`), the same per-row allocation the Pyreon/Solid arms pay at
 * create time.
 */
export class SvelteRow {
  id: number
  label: string

  constructor(id: number, label: string) {
    this.id = id
    this.label = $state(label)
  }
}

export const state = $state<{
  selectedId: number | null
}>({
  selectedId: null,
})

let rawRows = $state.raw<SvelteRow[]>([])

/** Read the row list — reactive: `{#each getRows() …}` re-runs on replace. */
export function getRows(): SvelteRow[] {
  return rawRows
}

/** Replace the row list wholesale (the only supported write). */
export function setRawRows(next: SvelteRow[]): void {
  rawRows = next
}
