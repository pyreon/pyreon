/**
 * Svelte 5 shared state for the deep-tree / context scenario.
 *
 * Plain `$state` here (NOT `$state.raw`): this is a single scalar holder that
 * is MUTATED in place (`deepCtx.value = …`), which is precisely the case the
 * deep proxy exists for. The `$state.raw` opt-out used elsewhere in this suite
 * is for large structures replaced wholesale — the opposite shape. One proxy
 * for one object is not a cost worth avoiding.
 *
 * The object is handed to `setContext()` by `DeepTree.svelte`, so leaves reach
 * it through Svelte's real context API rather than importing it directly —
 * otherwise the scenario would not be measuring context at all.
 */
export const DEEP_CTX_KEY = Symbol('pyreon-bench-deep-ctx')

export interface DeepCtx {
  value: string
}

export const deepCtx = $state<DeepCtx>({ value: '' })

export function setDeepValue(v: string): void {
  deepCtx.value = v
}
