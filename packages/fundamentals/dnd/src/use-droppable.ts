import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { batch, isServer, onCleanup, signal } from '@pyreon/reactivity'
import type { DragData, DropEdge, UseDroppableOptions, UseDroppableResult } from './types'

/**
 * Make an element a drop target with signal-driven state.
 *
 * @example
 * ```tsx
 * let zoneEl: HTMLElement | null = null
 *
 * const { isOver, overEdge } = useDroppable({
 *   element: () => zoneEl,
 *   onDrop: (data) => handleDrop(data),
 *   canDrop: (data) => data.type === "card",
 *   edges: ["top", "bottom"], // opt-in closest-edge detection
 * })
 *
 * <div ref={(el) => zoneEl = el} class={isOver() ? "bg-blue-50" : ""}>
 *   Drop here
 * </div>
 * ```
 */
export function useDroppable<T extends DragData = DragData>(
  options: UseDroppableOptions<T>,
): UseDroppableResult {
  if (isServer) return { isOver: () => false, overEdge: () => null }

  const isOver = signal(false)
  const overEdge = signal<DropEdge | null>(null)
  let cleanup: (() => void) | undefined
  let disposed = false

  function setup() {
    // Unmounted before this deferred setup ran — don't register a target that
    // onCleanup (already fired with `cleanup` undefined) can never tear down.
    /* v8 ignore next — defensive disposed-during-setup guard */
    if (disposed) return
    // Defensive re-setup teardown: `setup` runs exactly once
    // (`queueMicrotask(setup)`, never re-invoked), so `cleanup` is always
    // undefined here — this branch never fires in the current single-shot
    // design. Kept so a future re-setup trigger can't leak a double target.
    /* v8 ignore next — defensive re-setup teardown; unreachable with single-shot queueMicrotask */
    if (cleanup) cleanup()

    const el = options.element()
    if (!el) return

    const edges = options.edges

    const resolveData = (): DragData => {
      if (!options.data) return {}
      return typeof options.data === 'function' ? (options.data as () => T)() : options.data
    }

    cleanup = dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        const data = resolveData()
        // Opt-in closest-edge detection — wraps the target data with
        // pdnd hitbox metadata so extractClosestEdge can read the live
        // edge on enter/drag.
        if (edges && edges.length > 0) {
          return attachClosestEdge(data, { input, element, allowedEdges: edges as Edge[] })
        }
        return data
      },
      // pdnd stickiness — keep "held" drop-target status while the
      // pointer crosses gaps between targets. Pass-through of getIsSticky.
      ...(options.sticky ? { getIsSticky: () => true } : {}),
      canDrop: ({ source }) => {
        if (!options.canDrop) return true
        return options.canDrop(source.data as DragData)
      },
      onDragEnter: ({ source, self }) => {
        // batch — isOver + overEdge settle in ONE notify pass for
        // subscribers reading both (matches useSortable's batching).
        batch(() => {
          isOver.set(true)
          if (edges) overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
        })
        options.onDragEnter?.(source.data as DragData)
      },
      // Live edge tracking while the pointer moves over the target —
      // only meaningful (and only wired) when edges are configured.
      ...(edges && edges.length > 0
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
      onDrop: ({ source }) => {
        batch(() => {
          isOver.set(false)
          overEdge.set(null)
        })
        options.onDrop?.(source.data as DragData)
      },
    })
  }

  queueMicrotask(setup)

  onCleanup(() => {
    disposed = true
    if (cleanup) cleanup()
  })

  return { isOver, overEdge }
}
