import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { centerUnderPointer } from '@atlaskit/pragmatic-drag-and-drop/utils/center-under-pointer'
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview'
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview'
import { isServer, signal } from '@pyreon/reactivity'
import { bindElement } from './element-binding'
import type { DragData, DragPreviewOptions, UseDraggableOptions, UseDraggableResult } from './types'

/**
 * Resolve a preview `offset` preset to pdnd's `GetOffsetFn`. Split out so
 * the ternary chain is directly unit-testable; `undefined` keeps the
 * browser default (top-left of the preview under the pointer).
 */
function resolvePreviewOffset(
  offset: DragPreviewOptions['offset'],
  source: { element: HTMLElement },
  input: Parameters<typeof preserveOffsetOnSource>[0]['input'],
): ReturnType<typeof pointerOutsideOfPreview> | undefined {
  if (offset === 'pointer-outside') return pointerOutsideOfPreview({ x: '16px', y: '8px' })
  if (offset === 'center') return centerUnderPointer
  if (offset === 'preserve-offset') {
    return preserveOffsetOnSource({ element: source.element, input })
  }
  return undefined
}

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

  const isDragging = signal(false)

  const resolveData = () =>
    typeof options.data === 'function' ? (options.data as () => T)() : options.data

  function register(el: HTMLElement): () => void {
    const handle = options.handle?.()
    const preview = options.preview
    return draggable({
      element: el,
      ...(handle ? { dragHandle: handle } : {}),
      // Custom native drag preview — thin pass-through to pdnd's
      // setCustomNativeDragPreview + offset presets. Only wired when the
      // consumer opts in, so the default path is byte-identical.
      ...(preview
        ? {
            onGenerateDragPreview: ({
              nativeSetDragImage,
              source,
              location,
            }: {
              nativeSetDragImage: Parameters<
                typeof setCustomNativeDragPreview
              >[0]['nativeSetDragImage']
              source: { element: HTMLElement }
              location: {
                initial: { input: Parameters<typeof preserveOffsetOnSource>[0]['input'] }
              }
            }) => {
              const getOffset = resolvePreviewOffset(preview.offset, source, location.initial.input)
              setCustomNativeDragPreview({
                render: ({ container }) => preview.render(container),
                nativeSetDragImage,
                ...(getOffset ? { getOffset } : {}),
              })
            },
          }
        : {}),
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
