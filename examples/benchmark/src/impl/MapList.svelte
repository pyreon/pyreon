<!--
  Svelte 5 arm of the `maplist` scenario: Svelte's idiom for the keyed `.map()`
  list is the keyed `{#each … (row.id)}` block, and for conditional JSX in a
  slot it is `{#if}` / `{:else}`. Same DOM as every other arm
  (`scenario-maplist-shared.ts`).
-->
<script lang="ts">
  import { getMapRows } from './maplist-state.svelte'
</script>

<div class="ml">
  <table>
    <tbody>
      {#each getMapRows() as row (row.id)}
        <tr>
          <td class="id">{row.id}</td>
          <td class="label">{row.label}</td>
          <td class="status">{#if row.done}<span class="done">done</span>{:else}<em class="todo">todo</em>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if getMapRows().length === 0}<p class="empty">No rows</p>{/if}
</div>
