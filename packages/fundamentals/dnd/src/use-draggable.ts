import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { centerUnderPointer } from '@atlaskit/pragmatic-drag-and-drop/element/center-under-pointer'
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview'
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { isServer, onCleanup, signal } from '@pyreon/reactivity'
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
    // Defensive re-setup teardown: `setup` is scheduled exactly once
    // (`queueMicrotask(setup)`) and never re-invoked, so `cleanup` is always
    // undefined here — this branch never fires in the current single-shot
    // design. Kept so a future re-setup trigger (element-change re-registration)
    // can't leak a double registration.
    /* v8 ignore next — defensive re-setup teardown; unreachable with single-shot queueMicrotask */
    if (cleanup) cleanup()

    const el = options.element()
    if (!el) return

    const resolveData = () =>
      typeof options.data === 'function' ? (options.data as () => T)() : options.data

    const handle = options.handle?.()
    const preview = options.preview
    cleanup = draggable({
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

  // Defer setup to next microtask so refs are populated
  queueMicrotask(setup)

  onCleanup(() => {
    disposed = true
    if (cleanup) cleanup()
  })

  return { isDragging }
}
