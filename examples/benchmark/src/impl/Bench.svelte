<!--
  Svelte 5 benchmark component using runes-based shared state.

  The `state` object is `$state(...)` from `bench-state.svelte.ts`.
  Mutating `state.rows` / `state.selectedId` from the harness fires
  the framework's reactive update through this component — same shape
  as every other framework's driver pattern.

  `{#each rows as row (row.id)}` is the keyed each block — what
  Svelte 5's compiler optimizes for the swap-rows test (LIS-based
  reconciliation matching Pyreon/Solid/Vue's keyed list contract).
-->
<script lang="ts">
  import { state } from './bench-state.svelte'
</script>

<table>
  <tbody>
    {#each state.rows as row (row.id)}
      <tr class={row.id === state.selectedId ? 'selected' : ''}>
        <td>{row.id}</td>
        <td>{row.label}</td>
      </tr>
    {/each}
  </tbody>
</table>
