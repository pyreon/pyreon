<!--
  One node of the balanced binary tree. Recurses by importing ITSELF — the
  Svelte 5 replacement for the deprecated `<svelte:self>`.

  Only the leaf calls `getContext`; interior nodes exist so the benchmark can
  see whether a context change walks them or reaches subscribers directly.
-->
<script lang="ts">
  import { getContext } from 'svelte'
  import DeepNode from './DeepNode.svelte'
  import { DEEP_CTX_KEY, type DeepCtx } from './tree-state.svelte'

  const { depth }: { depth: number } = $props()
  const ctx = depth <= 1 ? getContext<DeepCtx>(DEEP_CTX_KEY) : undefined
</script>

{#if depth <= 1}
  <span class="leaf">{ctx!.value}</span>
{:else}
  <div class="branch">
    <DeepNode depth={depth - 1} />
    <DeepNode depth={depth - 1} />
  </div>
{/if}
