import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { isServer, onCleanup, signal } from '@pyreon/reactivity'
import type { DragData, UseDraggableOptions, UseDraggableResult } from './types'

/**
 * Make an element draggable with signal-driven state.
 *
 * @example
 * ```tsx
 * let cardEl: HTMLElement | null = null
 *
 * const { isDragging } = useDraggable({
 *   element: () => cardEl,
 *   data: { id: card.id, type: "card" },
 * })
 *
 * <div ref={(el) => cardEl = el} class={isDragging() ? "opacity-50" : ""}>
 *   {card.title}
 * </div>
 * ```
 */
export function useDraggable<T extends DragData = DragData>(
  options: UseDraggableOptions<T>,
): UseDraggableResult {
  if (isServer) return { isDragging: () => false }

  const isDragging = signal(false)
  let cleanup: (() => void) | undefined
  let disposed = false

  function setup() {
    // The hook may have unmounted before this deferred (queueMicrotask) setup
    // ran. onCleanup fired with `cleanup` still undefined (a no-op), so a
    // registration created here would never be torn down — bail instead.
    /* v8 ignore next — defensive disposed-during-setup guard; tested implicitly via lifecycle */
    if (disposed) return
    if (cleanup) cleanup()

    const el = options.element()
    if (!el) return

    const resolveData = () =>
      typeof options.data === 'function' ? (options.data as () => T)() : options.data

    const handle = options.handle?.()
    cleanup = draggable({
      element: el,
      ...(handle ? { dragHandle: handle } : {}),
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

  // Defer setup to next microtask so refs are populated
  queueMicrotask(setup)

  onCleanup(() => {
    disposed = true
    if (cleanup) cleanup()
  })

  return { isDragging }
}
