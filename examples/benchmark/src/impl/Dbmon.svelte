<!--
  Svelte 5 dbmon component.

  The `{#each}` is deliberately UNKEYED: the 100 rows are fixed and never
  reorder, so index reuse is both the idiomatic and the fastest choice here.
  Adding a key would buy reconciliation the scenario does not exercise (the
  main suite's swap/remove/append ops already cover keyed reconciliation).

  Five query cells are written out literally, matching every other framework's
  template in this scenario.
-->
<script lang="ts">
  import { getTick } from './dbmon-state.svelte'
  import { DB_NAMES } from './scenario-shared'
</script>

<table>
  <tbody>
    {#each getTick() as sample, i}
      <tr>
        <td class="dbname">{DB_NAMES[i]}</td>
        <td class="query-count"><span class={sample.countCls}>{sample.queryCount}</span></td>
        <td class={sample.queries[0].cls}>{sample.queries[0].elapsed}</td>
        <td class={sample.queries[1].cls}>{sample.queries[1].elapsed}</td>
        <td class={sample.queries[2].cls}>{sample.queries[2].elapsed}</td>
        <td class={sample.queries[3].cls}>{sample.queries[3].elapsed}</td>
        <td class={sample.queries[4].cls}>{sample.queries[4].elapsed}</td>
      </tr>
    {/each}
  </tbody>
</table>
