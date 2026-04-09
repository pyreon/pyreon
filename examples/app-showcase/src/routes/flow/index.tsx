import { Background, Controls, Flow, MiniMap, Panel } from '@pyreon/flow'
import { FlowToolbar } from '../../sections/flow/FlowToolbar'
import { JsonSidebar } from '../../sections/flow/JsonSidebar'
import { WorkflowNode } from '../../sections/flow/WorkflowNode'
import { useFlowEditor } from '../../sections/flow/store'
import {
  CanvasFrame,
  FlowLead,
  FlowPage,
  FlowTitle,
  Header,
  HeaderText,
  HintFooter,
  HintItem,
  Workspace,
} from '../../sections/flow/styled'

/**
 * Flow Editor — visual workflow builder backed by `@pyreon/flow` with
 * a live `@pyreon/code` JSON sidebar.
 *
 * Demonstrates:
 *   • @pyreon/flow      — createFlow, <Flow>, custom node renderers
 *                          via `nodeTypes`, layered auto-layout via
 *                          elkjs (lazy-loaded), undo/redo, fit view,
 *                          edge animation
 *   • @pyreon/code      — createEditor + <CodeEditor> with JSON
 *                          syntax highlighting, two-way binding to a
 *                          live signal-backed model
 *   • @pyreon/store     — composition store wrapping the flow
 *                          instance so it survives navigation
 *
 * The interesting bit is the JSON sidebar's bidirectional binding —
 * see `JsonSidebar.tsx` for the loop-prevention pattern.
 */
export default function FlowRoute() {
  const flow = useFlowEditor().store

  return (
    <FlowPage>
      <Header>
        <HeaderText>
          <FlowTitle>Flow Editor</FlowTitle>
          <FlowLead>
            Drag nodes to rearrange. Edit the JSON on the right to mutate the graph from text.
            Both views read and write the SAME signal-backed flow instance.
          </FlowLead>
        </HeaderText>
      </Header>

      <FlowToolbar />

      <Workspace>
        <CanvasFrame>
          <Flow instance={flow.instance} nodeTypes={{ workflow: WorkflowNode }}>
            <Background variant="dots" gap={20} size={1} color="#e2e8f0" />
            <Controls position="bottom-left" />
            <MiniMap
              width={180}
              height={120}
              maskColor="rgba(15, 23, 42, 0.06)"
              nodeColor={(node) => {
                const kind = (node.data as { kind?: string } | undefined)?.kind
                switch (kind) {
                  case 'trigger':
                    return '#6366f1'
                  case 'filter':
                    return '#f97316'
                  case 'transform':
                    return '#22c55e'
                  case 'notify':
                    return '#ef4444'
                  default:
                    return '#94a3b8'
                }
              }}
            />
            <Panel position="top-right" style="font-size: 11px; color: #64748b; padding: 6px 10px; background: rgba(255,255,255,0.85); border-radius: 6px; border: 1px solid #e2e8f0">
              {() => `zoom ${(flow.instance.zoom() * 100).toFixed(0)}%`}
            </Panel>
          </Flow>
        </CanvasFrame>

        <JsonSidebar />
      </Workspace>

      <HintFooter>
        <HintItem>
          <strong>Drag</strong> nodes on the canvas
        </HintItem>
        <HintItem>
          <strong>Scroll</strong> to zoom
        </HintItem>
        <HintItem>
          <strong>Edit JSON</strong> to mutate the graph
        </HintItem>
        <HintItem>
          <strong>Auto-layout</strong> uses lazy-loaded elkjs
        </HintItem>
      </HintFooter>
    </FlowPage>
  )
}

export const meta = {
  title: 'Flow Editor — Pyreon App Showcase',
}
