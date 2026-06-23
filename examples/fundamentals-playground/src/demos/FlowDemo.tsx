import { Background, Controls, Flow, MiniMap, useFlow } from '@pyreon/flow'

export function FlowDemo() {
  const flow = useFlow({
    nodes: [
      {
        id: 'a',
        position: { x: 60, y: 80 },
        data: { label: 'Source' },
        width: 140,
        height: 50,
      },
      {
        id: 'b',
        position: { x: 280, y: 40 },
        data: { label: 'Filter' },
        width: 140,
        height: 50,
      },
      {
        id: 'c',
        position: { x: 280, y: 160 },
        data: { label: 'Transform' },
        width: 140,
        height: 50,
      },
      {
        id: 'd',
        position: { x: 500, y: 100 },
        data: { label: 'Sink' },
        width: 140,
        height: 50,
      },
    ],
    edges: [
      { id: 'a-b', source: 'a', target: 'b' },
      { id: 'a-c', source: 'a', target: 'c' },
      { id: 'b-d', source: 'b', target: 'd' },
      { id: 'c-d', source: 'c', target: 'd' },
    ],
  })

  return (
    <div>
      <h2>Flow</h2>
      <p class="desc">
        Reactive flow diagrams — signal-native nodes/edges, pan/zoom,
        auto-layout via lazy-loaded elkjs. Drag the nodes to rearrange;
        use the controls in the bottom-left to fit/zoom; the MiniMap
        tracks the viewport.
      </p>

      <div class="section">
        <h3>Live graph</h3>
        <div
          data-testid="flow-canvas"
          style="height: 360px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; overflow: hidden"
        >
          <Flow instance={flow}>
            <Background variant="dots" gap={20} size={1} color="#e2e8f0" />
            <MiniMap width={160} height={100} />
            <Controls position="bottom-left" />
          </Flow>
        </div>
      </div>

      <div class="section">
        <h3>State</h3>
        <p>
          Nodes: <strong data-testid="flow-node-count">{() => flow.nodes().length}</strong>
          {' · '}
          Edges: <strong data-testid="flow-edge-count">{() => flow.edges().length}</strong>
          {' · '}
          Zoom:{' '}
          <strong data-testid="flow-zoom">
            {() => `${(flow.zoom() * 100).toFixed(0)}%`}
          </strong>
        </p>
        <div class="row" style="margin-top: 12px">
          <button data-testid="flow-fit" onClick={() => flow.fitView()}>
            Fit view
          </button>
          <button
            data-testid="flow-add"
            onClick={() => {
              const id = `n${flow.nodes().length + 1}`
              flow.addNode({
                id,
                position: {
                  x: 80 + Math.random() * 500,
                  y: 80 + Math.random() * 250,
                },
                data: { label: id },
                width: 100,
                height: 40,
              })
            }}
          >
            Add node
          </button>
          <button
            data-testid="flow-layout"
            onClick={() =>
              flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 60 })
            }
          >
            Auto-layout
          </button>
        </div>
      </div>
    </div>
  )
}
