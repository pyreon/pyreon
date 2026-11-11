<!--
  `Svelte Flow 1` arm of the `flow` scenario.

  Svelte Flow's documented shape (https://svelteflow.dev/learn): nodes and edges
  in `$state.raw` arrays bound to `<SvelteFlow bind:nodes bind:edges>`, inside a
  `<SvelteFlowProvider>` so a sibling can call `useSvelteFlow()`
  (https://svelteflow.dev/api-reference/hooks/use-svelte-flow). Adding and
  removing nodes is done by assigning new arrays, which is how Svelte Flow
  documents it (`useSvelteFlow` has no `addNodes`); moves, selection and the
  viewport go through `updateNode` / `setViewport`.
-->
<script lang="ts">
  import { SvelteFlow, SvelteFlowProvider, type Edge, type Node } from '@xyflow/svelte'
  import FlowSvelteApi from './FlowSvelteApi.svelte'

  interface FlowSvelteHandle {
    updateNode: (id: string, update: Partial<Node>) => void
    setViewport: (v: { x: number; y: number; zoom: number }) => void
    addGraph: (n: Node[], e: Edge[]) => void
    removeGraph: (nodeIds: Set<string>, edgeIds: Set<string>) => void
  }

  let {
    initialNodes,
    initialEdges,
    onReady,
  }: { initialNodes: Node[]; initialEdges: Edge[]; onReady: (h: FlowSvelteHandle) => void } = $props()

  let nodes = $state.raw(initialNodes)
  let edges = $state.raw(initialEdges)

  function onApi(api: Pick<FlowSvelteHandle, 'updateNode' | 'setViewport'>) {
    onReady({
      ...api,
      addGraph: (n, e) => {
        nodes = [...nodes, ...n]
        edges = [...edges, ...e]
      },
      removeGraph: (ns, es) => {
        nodes = nodes.filter((n) => !ns.has(n.id))
        edges = edges.filter((e) => !es.has(e.id))
      },
    })
  }
</script>

<SvelteFlowProvider>
  <SvelteFlow bind:nodes bind:edges fitView={false} proOptions={{ hideAttribution: true }} />
  <FlowSvelteApi {onApi} />
</SvelteFlowProvider>
