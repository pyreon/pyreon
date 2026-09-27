import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { batch, isServer, signal } from '@pyreon/reactivity'
import { bindElement } from './element-binding'
import type {
  DragData,
  DropEdge,
  DropLocation,
  UseDroppableOptions,
  UseDroppableResult,
} from './types'

/**
 * Make an element a drop target with signal-driven state.
 *
 * Attach the returned `ref` to the element (works for elements that mount
 * later or get swapped), or pass an `element` getter.
 *
 * @example
 * ```tsx
 * const { ref, isOver, overEdge } = useDroppable({
 *   onDrop: (data, { edge }) => handleDrop(data, edge),
 *   canDrop: (data) => data.type === "card",
 *   edges: ["top", "bottom"], // opt-in closest-edge detection
 * })
 *
 * <div ref={ref} class={isOver() ? "bg-blue-50" : ""}>
 *   Drop here
 * </div>
 * ```
 */
export function useDroppable<T extends DragData = DragData, TSource extends DragData = DragData>(
  options: UseDroppableOptions<T, TSource>,
): UseDroppableResult {
  if (isServer) return { isOver: () => false, overEdge: () => null, ref: () => {} }

  const isOver = signal(false)
  const overEdge = signal<DropEdge | null>(null)
  const edges = options.edges
  const hasEdges = !!edges && edges.length > 0

  const resolveData = (): DragData => {
    if (!options.data) return {}
    return typeof options.data === 'function' ? (options.data as () => T)() : options.data
  }

  function register(el: HTMLElement): () => void {
    return dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        const data = resolveData()
        // Opt-in closest-edge detection — wraps the target data with
        // pdnd hitbox metadata so extractClosestEdge can read the live
        // edge on enter/drag.
        if (hasEdges) {
          return attachClosestEdge(data, { input, element, allowedEdges: edges as Edge[] })
        }
        return data
      },
      // pdnd stickiness — keep "held" drop-target status while the
      // pointer crosses gaps between targets. Pass-through of getIsSticky.
      ...(options.sticky ? { getIsSticky: () => true } : {}),
      canDrop: ({ source }) => {
        if (!options.canDrop) return true
        return options.canDrop(source.data as TSource)
      },
      onDragEnter: ({ source, self }) => {
        // batch — isOver + overEdge settle in ONE notify pass for
        // subscribers reading both (matches useSortable's batching).
        batch(() => {
          isOver.set(true)
          if (hasEdges) overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
        })
        options.onDragEnter?.(source.data as TSource)
      },
      // Live edge tracking while the pointer moves over the target —
      // only meaningful (and only wired) when edges are configured.
      ...(hasEdges
        ? {
            onDrag: ({ self }: { self: { data: Record<string | symbol, unknown> } }) => {
              overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
            },
          }
        : {}),
      onDragLeave: () => {
        batch(() => {
          isOver.set(false)
          overEdge.set(null)
        })
        options.onDragLeave?.()
      },
      onDrop: ({ source, self }) => {
        // Capture WHERE the drop landed before the reset below clears the
        // signal — `onDrop` used to receive only the source, so the edge a
        // consumer needs to insert above/below was already gone.
        const location: DropLocation = {
          edge: hasEdges
            ? ((extractClosestEdge(self.data) as DropEdge | null) ?? overEdge.peek())
            : null,
          data: resolveData(),
        }
        batch(() => {
          isOver.set(false)
          overEdge.set(null)
        })
        options.onDrop?.(source.data as TSource, location)
      },
    })
  }

  const { ref } = bindElement('useDroppable', options.element, register)

  return { isOver, overEdge, ref }
}
