import { CodeEditor, createEditor } from '@pyreon/code'
import { effect, signal } from '@pyreon/reactivity'
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
 * JSON sidebar — bidirectional bridge between the flow canvas and a
 * code editor.
 *
 *   Canvas → JSON
 *     An effect watches `instance.nodes()` and `instance.edges()` and
 *     re-serializes via `toJSON()`. The result is written to
 *     `editor.value.set(...)`.
 *
 *   JSON → Canvas
 *     The editor's `onChange` callback parses the new value and calls
 *     `instance.fromJSON(...)` via the store helper. Parse errors are
 *     surfaced inline (the canvas keeps showing the last valid graph).
 *
 * The hard part is preventing feedback loops — without a guard, the
 * canvas → JSON write would re-trigger the editor's onChange, which
 * would re-parse and re-apply, which would re-fire the canvas effect,
 * etc. Two flags break the cycle:
 *
 *   • `applyingFromCanvas` — set to true while we write the
 *     serialized JSON into the editor. The onChange handler bails when
 *     this is set.
 *   • `applyingFromEditor` — set to true while we apply parsed JSON
 *     to the canvas. The serialization effect bails when this is set.
 *
 * The flags are bare booleans, not signals — we don't want them to
 * be tracked dependencies of either side.
 */
export function JsonSidebar() {
  const flow = useFlowEditor().store
  const parseError = signal<string | null>(null)

  // Mutable flags scoped to this component instance.
  let applyingFromCanvas = false
  let applyingFromEditor = false

  /**
   * Format the current flow as a stable, sorted JSON string. We omit
   * the viewport (it's not a meaningful part of the graph) and round
   * positions to 1 decimal so cursor noise from drags doesn't churn
   * the sidebar text every frame.
   */
  function serialize(): string {
    const json = flow.instance.toJSON()
    return JSON.stringify(
      {
        nodes: json.nodes.map((n: FlowNode<WorkflowNodeData>) => ({
          id: n.id,
          type: n.type,
          position: { x: round(n.position.x), y: round(n.position.y) },
          data: n.data,
        })),
        edges: json.edges.map((e: FlowEdge) => ({
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

  const editor = createEditor({
    value: serialize(),
    language: 'json',
    theme: 'light',
    lineNumbers: true,
    bracketMatching: true,
    foldGutter: true,
    onChange: (next: string) => {
      if (applyingFromCanvas) return
      applyingFromEditor = true
      const err = flow.loadJson(next)
      parseError.set(err)
      applyingFromEditor = false
    },
  })

  // Canvas → JSON. Reading nodes/edges inside the effect subscribes
  // to both signals so any addNode / removeEdge / drag completes a
  // full re-serialization. The drag-in-progress case is handled by
  // the position rounding above — sub-pixel jitter doesn't change
  // the string output.
  onMount(() => {
    const fx = effect(() => {
      // Subscribe to the signals.
      flow.instance.nodes()
      flow.instance.edges()

      if (applyingFromEditor) return

      const next = serialize()
      if (next === editor.value.peek()) return

      applyingFromCanvas = true
      editor.value.set(next)
      applyingFromCanvas = false
    })
    return () => fx.dispose()
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

function round(n: number): number {
  return Math.round(n * 10) / 10
}
