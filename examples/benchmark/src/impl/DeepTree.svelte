<!--
  Root of the Svelte deep tree. Publishes the shared `$state` holder through
  Svelte's real `setContext`, so leaves reach the value the same way a Svelte
  app would rather than by importing the module directly.
-->
<script lang="ts">
  import { setContext } from 'svelte'
  import DeepNode from './DeepNode.svelte'
  import { DEEP_CTX_KEY, deepCtx } from './tree-state.svelte'

  const { depth }: { depth: number } = $props()
  setContext(DEEP_CTX_KEY, deepCtx)
</script>

<div class="tree-root">
  <DeepNode {depth} />
</div>
