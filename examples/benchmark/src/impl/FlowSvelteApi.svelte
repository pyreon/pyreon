<script lang="ts">
  import { useSvelteFlow, type Node } from '@xyflow/svelte'

  let {
    onApi,
  }: {
    onApi: (api: {
      updateNode: (id: string, update: Partial<Node>) => void
      setViewport: (v: { x: number; y: number; zoom: number }) => void
    }) => void
  } = $props()

  const flow = useSvelteFlow()
  onApi({
    updateNode: (id, update) => flow.updateNode(id, update),
    setViewport: (v) => void flow.setViewport(v),
  })
</script>
