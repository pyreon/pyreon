<!--
  One memoization-wall consumer.

  A real component (not an `{#each}` item) so the Svelte arm has the same
  300-component shape as every other framework in this scenario — React's wall
  is a component-boundary bailout, so comparing it against 300 inline text
  bindings would not be like-for-like.
-->
<script lang="ts">
  let { bucket }: { bucket: number } = $props()
</script>

<span class="memo-consumer">{bucket}</span>
