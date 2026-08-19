/**
 * Svelte 5 shared state for the memoization-wall scenario.
 *
 * Plain `$state` on a single scalar — NOT `$state.raw`. The `$state.raw`
 * opt-out used by `dbmon-state.svelte.ts` is for large structures REPLACED
 * wholesale; this is one number, which is exactly what the ordinary rune is
 * for. There is no proxy cost to avoid on a primitive.
 *
 * The derived value deliberately lives in `MemoWall.svelte` rather than here:
 * `$derived` short-circuits on referential identity, and the scenario is a
 * measurement OF that short-circuit, so it belongs in the component tree the
 * consumers actually subscribe through.
 */
let source = $state(0)

export function getSource(): number {
  return source
}

export function setSource(n: number): void {
  source = n
}
