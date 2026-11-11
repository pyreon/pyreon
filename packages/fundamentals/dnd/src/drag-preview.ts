import { centerUnderPointer } from '@atlaskit/pragmatic-drag-and-drop/utils/center-under-pointer'
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview'
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview'
import type { DragPreview, DragPreviewOptions } from './types'

/**
 * Resolve a preview `offset` preset to pdnd's `GetOffsetFn`. Split out so
 * the ternary chain is directly unit-testable; `undefined` keeps the
 * browser default (top-left of the preview under the pointer).
 */
export function resolvePreviewOffset(
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
 * A custom native drag preview for `useDraggable({ preview })` — a thin
 * surface over pdnd's `setCustomNativeDragPreview` + offset presets. The
 * browser's default snapshot is replaced by whatever `render` draws into the
 * container pdnd provides. A separate import, so a draggable without a custom
 * preview ships none of pdnd's preview utilities.
 *
 * @example
 * ```ts
 * useDraggable({
 *   data: { id: card.id },
 *   preview: dragPreview({ render: (c) => { c.textContent = card.title }, offset: 'center' }),
 * })
 * ```
 */
export function dragPreview(options: DragPreviewOptions): DragPreview {
  return {
    onGenerateDragPreview: ({ nativeSetDragImage, source, location }) => {
      const getOffset = resolvePreviewOffset(options.offset, source, location.initial.input)
      setCustomNativeDragPreview({
        render: ({ container }) => options.render(container),
        nativeSetDragImage,
        ...(getOffset ? { getOffset } : {}),
      })
    },
  }
}
