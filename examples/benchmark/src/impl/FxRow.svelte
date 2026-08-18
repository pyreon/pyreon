<!--
  One effect-heavy-list row.

  `$effect` is Svelte 5's documented "run a side effect when tracked state
  changes" rune. It reads `row.value` — one property of one deep-`$state`
  holder — so only the rows whose value actually changed re-run, which is what
  the `update one` op measures.

  Svelte's docs state `$effect` runs "in a microtask after state changes";
  `flushSync()` is the documented way to execute pending effects synchronously,
  which is what the driver's setter calls. The scenario's sink gate then PROVES
  that flush worked rather than assuming it.
-->
<script lang="ts">
  import type { FxRowState } from './effects-state.svelte'
  import type { EffectSink } from './scenario-graph-shared'

  let { row, index, sink }: { row: FxRowState; index: number; sink: EffectSink } = $props()

  $effect(() => {
    const v = row.value
    sink.values[index] = v
    sink.runs++
  })
</script>

<span class="fx-row">{row.value}</span>
