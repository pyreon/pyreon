import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { isServer, signal } from '@pyreon/reactivity'
import { bindElement } from './element-binding'
import type { DragData, UseDraggableOptions, UseDraggableResult } from './types'

/**
 * Make an element draggable with signal-driven state.
 *
 * Attach the returned `ref` to the element (works for elements that mount
 * later or get swapped), or pass an `element` getter.
 *
 * @example
 * ```tsx
 * const { ref, isDragging } = useDraggable({
 *   data: { id: card.id, type: "card" },
 * })
 *
 * <div ref={ref} class={isDragging() ? "opacity-50" : ""}>
 *   {card.title}
 * </div>
 * ```
 */
export function useDraggable<T extends DragData = DragData>(
  options: UseDraggableOptions<T>,
): UseDraggableResult {
  if (isServer) return { isDragging: () => false, ref: () => {} }

  if (
    process.env.NODE_ENV !== 'production' &&
    options.preview &&
    typeof options.preview.onGenerateDragPreview !== 'function'
  ) {
    throw new Error(
      '[Pyreon] useDraggable({ preview }) takes dragPreview({ render, offset }) from @pyreon/dnd, not the options object.',
    )
  }

  const isDragging = signal(false)

  const resolveData = () =>
    typeof options.data === 'function' ? (options.data as () => T)() : options.data

  function register(el: HTMLElement): () => void {
    const handle = options.handle?.()
    const preview = options.preview
    return draggable({
      element: el,
      ...(handle ? { dragHandle: handle } : {}),
      // Custom native drag preview — only when the consumer passes one built
      // by `dragPreview()`, so the default path ships none of its code.
      ...(preview ? { onGenerateDragPreview: preview.onGenerateDragPreview } : {}),
      getInitialData: resolveData,
      canDrag: () => {
        const disabled = options.disabled
        if (typeof disabled === 'function') return !disabled()
        return !disabled
      },
      onDragStart: () => {
        isDragging.set(true)
        options.onDragStart?.()
      },
      onDrop: () => {
        isDragging.set(false)
        options.onDragEnd?.()
      },
    })
  }

  const { ref } = bindElement('useDraggable', options.element, register)

  return { isDragging, ref }
}
