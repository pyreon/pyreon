import type { FlowEdge, FlowNode } from '@pyreon/flow'
import type { WorkflowNodeData } from './types'

/**
 * Initial workflow: ingest events → filter to errors → enrich with
 * stack trace metadata → notify on-call. Lifelike enough that the
 * JSON sidebar shows something interesting on first load.
 *
 * Positions are picked so the auto-layout button has visible work
 * to do — they intentionally don't form a clean column.
 */
export const SEED_NODES: FlowNode<WorkflowNodeData>[] = [
  {
    id: 'trigger-1',
    type: 'workflow',
    position: { x: 40, y: 60 },
    data: {
      kind: 'trigger',
      label: 'Webhook trigger',
      config: 'POST /events/ingest',
    },
  },
  {
    id: 'filter-1',
    type: 'workflow',
    position: { x: 280, y: 200 },
    data: {
      kind: 'filter',
      label: 'Errors only',
      config: 'severity = "error"',
    },
  },
  {
    id: 'transform-1',
    type: 'workflow',
    position: { x: 540, y: 60 },
    data: {
      kind: 'transform',
      label: 'Enrich',
      config: 'attach stack trace',
    },
  },
  {
    id: 'notify-1',
    type: 'workflow',
    position: { x: 800, y: 220 },
    data: {
      kind: 'notify',
      label: 'PagerDuty',
      config: 'on-call rotation',
    },
  },
]

export const SEED_EDGES: FlowEdge[] = [
  { id: 'e-trigger-filter', source: 'trigger-1', target: 'filter-1', animated: true },
  { id: 'e-filter-transform', source: 'filter-1', target: 'transform-1', animated: true },
  { id: 'e-transform-notify', source: 'transform-1', target: 'notify-1', animated: true },
]

/** Matches the WorkflowNodeData kind union — used by the toolbar's add button. */
export const NODE_KIND_LABELS: Record<WorkflowNodeData['kind'], string> = {
  trigger: 'Trigger',
  filter: 'Filter',
  transform: 'Transform',
  notify: 'Notify',
}
