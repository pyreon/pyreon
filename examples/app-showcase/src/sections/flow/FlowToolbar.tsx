import { NODE_KIND_LABELS } from './data/seed'
import type { WorkflowNodeKind } from './data/types'
import { useFlowEditor } from './store'
import { PrimaryButton, Toolbar, ToolbarButton, ToolbarGroup } from './styled'

const KINDS: WorkflowNodeKind[] = ['trigger', 'filter', 'transform', 'notify']

/**
 * Flow toolbar — node insertion, layout, undo/redo, fit view.
 *
 * The "Auto-layout" button triggers `instance.layout('layered', ...)`
 * which lazy-loads elkjs (the layout engine isn't bundled with
 * @pyreon/flow's core). The promise resolves after the layout pass;
 * we don't await it because the call dispatches positions through
 * signals as it goes — the canvas + JSON sidebar both animate to
 * the new positions reactively.
 */
export function FlowToolbar() {
  const flow = useFlowEditor().store
  const { instance } = flow

  function onLayout() {
    void instance.layout('layered', {
      direction: 'RIGHT',
      nodeSpacing: 60,
      layerSpacing: 100,
      animate: true,
      animationDuration: 300,
    })
  }

  return (
    <Toolbar>
      <ToolbarGroup>
        {KINDS.map((kind) => (
          <ToolbarButton type="button" onClick={() => flow.addNodeOfKind(kind)}>
            + {NODE_KIND_LABELS[kind]}
          </ToolbarButton>
        ))}
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton type="button" onClick={() => instance.undo()} title="Undo">
          ← Undo
        </ToolbarButton>
        <ToolbarButton type="button" onClick={() => instance.redo()} title="Redo">
          Redo →
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton type="button" onClick={onLayout} title="Auto-layout (elkjs)">
          ↳ Auto-layout
        </ToolbarButton>
        <ToolbarButton type="button" onClick={() => instance.fitView()} title="Fit view">
          ⤢ Fit
        </ToolbarButton>
        <ToolbarButton type="button" onClick={() => instance.zoomIn()} title="Zoom in">
          +
        </ToolbarButton>
        <ToolbarButton type="button" onClick={() => instance.zoomOut()} title="Zoom out">
          −
        </ToolbarButton>
      </ToolbarGroup>

      <PrimaryButton type="button" onClick={() => flow.reset()}>
        Reset
      </PrimaryButton>
    </Toolbar>
  )
}
