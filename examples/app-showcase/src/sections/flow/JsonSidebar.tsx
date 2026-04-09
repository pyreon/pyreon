import { bindEditorToSignal, CodeEditor, createEditor, type SignalLike } from '@pyreon/code'
import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import type { FlowEdge, FlowNode } from '@pyreon/flow'
import type { WorkflowNodeData } from './data/types'
import { useFlowEditor } from './store'
import {
  ParseError,
  ParseOk,
  SidebarColumn,
  SidebarEditorFrame,
  SidebarLabel,
} from './styled'

/**
 * Shape of the flow state we round-trip through the JSON editor.
 * Mirrors the subset of `flow.toJSON()` we care about — viewport
 * is intentionally omitted because it's not a meaningful part of
 * the graph the user is editing.
 */
interface FlowState {
  nodes: FlowNode<WorkflowNodeData>[]
  edges: FlowEdge[]
}

/**
 * JSON sidebar — bidirectional bridge between the flow canvas and a
 * code editor, powered by `bindEditorToSignal` from `@pyreon/code`.
 *
 * Before the helper landed, this component hand-rolled the
 * applyingFromCanvas / applyingFromEditor flag pair to break the
 * format-on-input race (see `bind-signal.ts` JSDoc for the full
 * explanation). Now both directions are managed by the helper, and
 * this component only has to provide:
 *
 *   • A `SignalLike<FlowState>` that reads from `flow.instance.nodes`
 *     and `.edges` and writes via `flow.instance.fromJSON()`
 *   • A deterministic `serialize` function that rounds node positions
 *     to 1 decimal (so sub-pixel drag jitter doesn't churn the editor
 *     text every frame)
 *   • A `parse` function that throws on shape errors and clears the
 *     parseError signal on success
 *
 * The helper handles the rest. Cleanup happens via `binding.dispose()`
 * inside `onMount`'s cleanup callback.
 */
export function JsonSidebar() {
  const flow = useFlowEditor().store
  const parseError = signal<string | null>(null)

  // SignalLike adapter — reads the live flow state when the binding
  // calls it (which subscribes the binding's effect to nodes() and
  // edges()), and writes back via fromJSON when the binding sets a
  // new value. The helper sees a normal Signal-shaped object; the
  // underlying state lives in the flow instance.
  const flowState: SignalLike<FlowState> = Object.assign(
    () => ({
      nodes: flow.instance.nodes(),
      edges: flow.instance.edges(),
    }),
    {
      set: (state: FlowState) => {
        flow.instance.pushHistory()
        flow.instance.fromJSON(state)
      },
    },
  )

  const editor = createEditor({
    value: serialize({
      nodes: flow.instance.nodes(),
      edges: flow.instance.edges(),
    }),
    language: 'json',
    theme: 'light',
    lineNumbers: true,
    bracketMatching: true,
    foldGutter: true,
  })

  onMount(() => {
    const binding = bindEditorToSignal({
      editor,
      signal: flowState,
      serialize,
      parse: (text) => {
        let obj: unknown
        try {
          obj = JSON.parse(text)
        } catch (err) {
          throw err instanceof Error ? err : new Error('Invalid JSON')
        }
        if (!obj || typeof obj !== 'object') {
          throw new Error('Expected an object with `nodes` and `edges` arrays')
        }
        const o = obj as { nodes?: unknown; edges?: unknown }
        if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) {
          throw new Error('Expected `nodes` and `edges` to be arrays')
        }
        // Successful parse — clear any prior error.
        parseError.set(null)
        return {
          nodes: o.nodes as FlowNode<WorkflowNodeData>[],
          edges: o.edges as FlowEdge[],
        }
      },
      onParseError: (err) => parseError.set(err.message),
    })
    return () => binding.dispose()
  })

  return (
    <SidebarColumn>
      <SidebarLabel>
        <span>Graph as JSON</span>
        <span>{() => `${flow.instance.nodes().length} nodes · ${flow.instance.edges().length} edges`}</span>
      </SidebarLabel>
      <SidebarEditorFrame>
        <CodeEditor instance={editor} />
      </SidebarEditorFrame>
      {() => {
        const err = parseError()
        if (err) return <ParseError>✗ {err}</ParseError>
        return <ParseOk>✓ Valid — edits sync to canvas</ParseOk>
      }}
    </SidebarColumn>
  )
}

/**
 * Format flow state as a deterministic JSON string. Positions are
 * rounded to 1 decimal so sub-pixel drag jitter doesn't change the
 * output every frame. Determinism is required by `bindEditorToSignal`
 * — if `serialize(state)` produced different strings on consecutive
 * calls with semantically equivalent state, the helper would
 * dispatch redundant editor writes that fight the user's typing.
 */
function serialize(state: FlowState): string {
  return JSON.stringify(
    {
      nodes: state.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: round(n.position.x), y: round(n.position.y) },
        data: n.data,
      })),
      edges: state.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        animated: e.animated,
      })),
    },
    null,
    2,
  )
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
