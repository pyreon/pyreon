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
 * REPLACED wholesale rather than mutated field-by-field — which is precisely
 * this workload: every write here assigns a fresh array, and no row object is
 * ever mutated in place. This is what a Svelte author optimising this table
 * would write, so it is what the benchmark must measure.
 *
 * Raw state cannot be exported as a reassignable `let` (the compiler rejects
 * reassigning an imported binding), hence the accessor pair. `selectedId`
 * stays a plain `$state` — it is one scalar, with no proxy cost worth avoiding.
 */
export type SvelteRow = { id: number; label: string }

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
