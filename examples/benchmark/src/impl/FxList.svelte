<!--
  Effect-heavy list — 500 row components, each owning one `$effect`.

  Unkeyed `{#each}`: the rows are fixed and never reorder, so index reuse is
  both idiomatic and fastest here. Keyed reconciliation is already covered by
  the main suite's swap/remove/append ops.
-->
<script lang="ts">
  import { rows } from './effects-state.svelte'
  import FxRow from './FxRow.svelte'
  import type { EffectSink } from './scenario-graph-shared'

  let { sink }: { sink: EffectSink } = $props()
</script>

<div class="fx-list">
  {#each rows as row, i}
    <FxRow {row} index={i} {sink} />
  {/each}
</div>
