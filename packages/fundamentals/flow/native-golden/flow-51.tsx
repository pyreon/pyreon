// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

      import { createFlow, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, DEFAULT_MARKER_END, MarkerType } from '@pyreon/flow'
      import { Button } from '@pyreon/primitives'
      export function X() {
        const flow = createFlow({
          nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
          edges: [{ id: 'e1', source: '1', target: '1' }],
        })
        return <Button onPress={() => {
          resolveMarker({ type: MarkerType.Arrow, color: '#F00' })
          markerId({ type: MarkerType.ArrowClosed })
          resolveEdgeMarkers(flow.edges()[0], null)
          collectEdgeMarkers(flow.edges(), DEFAULT_MARKER_END)
        }}>Markers</Button>
      }
    
