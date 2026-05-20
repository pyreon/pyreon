/**
 * Svelte 5 shared reactive state (runes).
 *
 * `.svelte.ts` extension tells the Svelte compiler to transform `$state`
 * runes outside of a `.svelte` component file. The exported object's
 * `rows` / `selectedId` fields are reactive — mutating them from the
 * harness (`state.rows = newRows`) triggers the component's keyed
 * `{#each ... (row.id)}` block to reconcile, same shape as every other
 * framework uses for the swap-rows test.
 */
export type SvelteRow = { id: number; label: string }

export const state = $state<{
  rows: SvelteRow[]
  selectedId: number | null
}>({
  rows: [],
  selectedId: null,
})
