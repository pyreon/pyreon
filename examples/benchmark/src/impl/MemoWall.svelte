<!--
  Svelte 5 memoization wall.

  `$derived` is the whole mechanism: Svelte's docs state that "if the new value
  of a derived is referentially identical to its previous value, downstream
  updates will be skipped". `bucket` is a NUMBER, so identity comparison is
  value comparison — the case that short-circuit is designed for. (Returning an
  object here would defeat it silently, which is why every arm in this scenario
  derives a primitive.)

  The `{#each}` is unkeyed: the 300 consumers are fixed and never reorder, so
  index reuse is both idiomatic and fastest. Keyed reconciliation is already
  covered by the main suite's swap/remove/append ops.
-->
<script lang="ts">
  import { getSource } from './memo-state.svelte'
  import MemoConsumer from './MemoConsumer.svelte'
  import { MEMO_BUCKET, MEMO_CONSUMERS } from './scenario-graph-shared'

  const bucket = $derived(Math.floor(getSource() / MEMO_BUCKET))
  // Plain array — `{#each}` wants an iterable, and this is built once at module
  // scope cost, never inside the timed region.
  const slots = Array.from({ length: MEMO_CONSUMERS }, (_, i) => i)
</script>

<div class="memo-root">
  <span class="memo-source">{getSource()}</span>
  <span class="memo-bucket">{bucket}</span>
  <div class="memo-consumers">
    {#each slots as _slot}
      <MemoConsumer {bucket} />
    {/each}
  </div>
</div>
