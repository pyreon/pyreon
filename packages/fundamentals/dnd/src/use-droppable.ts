import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { onCleanup, signal } from '@pyreon/reactivity'
import type { DragData, UseDroppableOptions, UseDroppableResult } from './types'

/**
 * Make an element a drop target with signal-driven state.
 *
 * @example
 * ```tsx
 * let zoneEl: HTMLElement | null = null
 *
 * const { isOver } = useDroppable({
 *   element: () => zoneEl,
 *   onDrop: (data) => handleDrop(data),
 *   canDrop: (data) => data.type === "card",
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
  if (typeof document === 'undefined') return { isOver: () => false }

  const isOver = signal(false)
  let cleanup: (() => void) | undefined

  function setup() {
    if (cleanup) cleanup()

    const el = options.element()
    if (!el) return

    cleanup = dropTargetForElements({
      element: el,
      getData: () => {
        if (!options.data) return {}
        return typeof options.data === 'function' ? (options.data as () => T)() : options.data
      },
      canDrop: ({ source }) => {
        if (!options.canDrop) return true
        return options.canDrop(source.data as DragData)
      },
      onDragEnter: ({ source }) => {
        isOver.set(true)
        options.onDragEnter?.(source.data as DragData)
      },
      onDragLeave: () => {
        isOver.set(false)
        options.onDragLeave?.()
      },
      onDrop: ({ source }) => {
        isOver.set(false)
        options.onDrop?.(source.data as DragData)
      },
    })
  }

  queueMicrotask(setup)

  onCleanup(() => {
    if (cleanup) cleanup()
  })

  return { isOver }
}
