import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/adapter/drop-target-for-external'
import { monitorForExternal } from '@atlaskit/pragmatic-drag-and-drop/adapter/monitor-for-external'
import { containsFiles } from '@atlaskit/pragmatic-drag-and-drop/utils/contains-files'
import { getFiles } from '@atlaskit/pragmatic-drag-and-drop/utils/get-files'
import { batch, isServer, signal } from '@pyreon/reactivity'
import { bindElement } from './element-binding'

/** Why a dropped file was not delivered to `onDrop`. */
export type FileRejectReason = 'accept' | 'maxFiles'

export interface UseFileDropOptions {
  /**
   * Element getter for the drop zone. Optional — attach the returned `ref`
   * instead for an element that mounts later or may be swapped. A getter that
   * reads a signal re-registers when the signal changes.
   */
  element?: () => HTMLElement | null
  /** Called when files are dropped (only the accepted ones). */
  onDrop: (files: File[]) => void
  /**
   * Called with the dropped files that were NOT delivered, and why: `'accept'`
   * (type / extension not in `accept`) or `'maxFiles'` (over the limit). Fired
   * once per reason per drop. Without it a rejected drop is silent.
   */
  onReject?: (rejected: File[], reason: FileRejectReason) => void
  /**
   * Filter accepted file types — MIME types (`"image/png"`), MIME wildcards
   * (`"image/*"`), extensions (`".pdf"`), or `"*"` / `"*\/*"` for any file.
   */
  accept?: string[]
  /** Maximum number of files. */
  maxFiles?: number
  /** Whether drop is disabled. */
  disabled?: boolean | (() => boolean)
}

export interface UseFileDropResult {
  /** Whether files are being dragged over the drop zone. */
  isOver: () => boolean
  /** Whether files are being dragged anywhere on the page. */
  isDraggingFiles: () => boolean
  /** Ref callback for the drop zone — see `UseFileDropOptions.element`. */
  ref: (el: HTMLElement | null) => void
}

function matchesAccept(file: File, accept: string[]): boolean {
  return accept.some((pattern) => {
    if (pattern === '*' || pattern === '*/*') return true
    if (pattern.startsWith('.')) {
      return file.name.toLowerCase().endsWith(pattern.toLowerCase())
    }
    if (pattern.endsWith('/*')) {
      return file.type.startsWith(pattern.slice(0, -1))
    }
    return file.type === pattern
  })
}

/**
 * File drop zone with signal-driven state.
 * Uses the native file drag events via pragmatic-drag-and-drop.
 *
 * @example
 * ```tsx
 * const { ref, isOver, isDraggingFiles } = useFileDrop({
 *   accept: ["image/*", ".pdf"],
 *   maxFiles: 5,
 *   onDrop: (files) => upload(files),
 *   onReject: (files, reason) => toast(`${files.length} file(s) rejected: ${reason}`),
 * })
 *
 * <div
 *   ref={ref}
 *   class={isOver() ? "drop-active" : isDraggingFiles() ? "drop-ready" : ""}
 * >
 *   Drop files here
 * </div>
 * ```
 */
export function useFileDrop(options: UseFileDropOptions): UseFileDropResult {
  if (isServer) return { isOver: () => false, isDraggingFiles: () => false, ref: () => {} }

  const isOver = signal(false)
  const isDraggingFiles = signal(false)

  function register(el: HTMLElement): () => void {
    const cleanups: (() => void)[] = []

    // Monitor for file drags anywhere on the page
    cleanups.push(
      monitorForExternal({
        canMonitor: ({ source }) => containsFiles({ source }),
        onDragStart: () => isDraggingFiles.set(true),
        onDrop: () => isDraggingFiles.set(false),
      }),
    )

    // Drop target on the specific element
    cleanups.push(
      dropTargetForExternal({
        element: el,
        canDrop: ({ source }) => {
          const disabled = options.disabled
          if (typeof disabled === 'function' ? disabled() : disabled) return false
          return containsFiles({ source })
        },
        onDragEnter: () => isOver.set(true),
        onDragLeave: () => isOver.set(false),
        onDrop: ({ source }) => {
          // batch() so onDrop subscribers don't get notified twice
          // (isOver + isDraggingFiles) per file-drop event.
          batch(() => {
            isOver.set(false)
            isDraggingFiles.set(false)
          })

          let files = getFiles({ source })

          // Filter by accept
          const accept = options.accept
          if (accept && accept.length > 0) {
            const rejected = files.filter((f) => !matchesAccept(f, accept))
            if (rejected.length > 0) {
              files = files.filter((f) => matchesAccept(f, accept))
              options.onReject?.(rejected, 'accept')
            }
          }

          // Limit count
          if (options.maxFiles && files.length > options.maxFiles) {
            options.onReject?.(files.slice(options.maxFiles), 'maxFiles')
            files = files.slice(0, options.maxFiles)
          }

          if (files.length > 0) {
            options.onDrop(files)
          }
        },
      }),
    )

    return () => {
      for (const fn of cleanups) fn()
    }
  }

  const { ref } = bindElement('useFileDrop', options.element, register)

  return { isOver, isDraggingFiles, ref }
}
