import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { onCleanup, signal } from "@pyreon/reactivity"
import type { DragData } from "./types"

export interface UseDragMonitorOptions {
  /** Called on any drag start in the page. */
  onDragStart?: (data: DragData) => void
  /** Called on any drop in the page. */
  onDrop?: (sourceData: DragData, targetData: DragData) => void
  /** Filter which drags to monitor. */
  canMonitor?: (data: DragData) => boolean
}

export interface UseDragMonitorResult {
  /** Whether any element is currently being dragged. */
  isDragging: () => boolean
  /** Data of the currently dragging element (null if not dragging). */
  dragData: () => DragData | null
}

/**
 * Monitor all drag operations on the page.
 * Useful for global drag indicators, analytics, or coordination between
 * multiple drag-and-drop areas.
 *
 * @example
 * ```tsx
 * const { isDragging, dragData } = useDragMonitor({
 *   canMonitor: (data) => data.type === "card",
 *   onDrop: (source, target) => logDrop(source, target),
 * })
 *
 * <Show when={isDragging()}>
 *   <div class="global-drag-overlay">
 *     Dragging: {() => dragData()?.name}
 *   </div>
 * </Show>
 * ```
 */
export function useDragMonitor(options?: UseDragMonitorOptions): UseDragMonitorResult {
  const isDragging = signal(false)
  const dragData = signal<DragData | null>(null)

  const canMonitorFn = options?.canMonitor
    ? ({ source }: { source: { data: Record<string, unknown> } }) =>
        options.canMonitor?.(source.data as DragData) ?? true
    : null

  const cleanup = monitorForElements({
    ...(canMonitorFn ? { canMonitor: canMonitorFn } : {}),
    onDragStart: ({ source }) => {
      isDragging.set(true)
      dragData.set(source.data as DragData)
      options?.onDragStart?.(source.data as DragData)
    },
    onDrop: ({ source, location }) => {
      isDragging.set(false)
      dragData.set(null)
      const targetData = location.current.dropTargets[0]?.data ?? {}
      options?.onDrop?.(source.data as DragData, targetData as DragData)
    },
  })

  onCleanup(cleanup)

  return { isDragging, dragData }
}
