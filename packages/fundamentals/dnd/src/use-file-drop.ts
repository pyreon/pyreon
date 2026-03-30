import {
  dropTargetForExternal,
  monitorForExternal,
} from '@atlaskit/pragmatic-drag-and-drop/external/adapter'
import { containsFiles, getFiles } from '@atlaskit/pragmatic-drag-and-drop/external/file'
import { onCleanup, signal } from '@pyreon/reactivity'

export interface UseFileDropOptions {
  /** Element getter for the drop zone. */
  element: () => HTMLElement | null
  /** Called when files are dropped. */
  onDrop: (files: File[]) => void
  /** Filter accepted file types (e.g. ["image/*", ".pdf"]). */
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
}

/**
 * File drop zone with signal-driven state.
 * Uses the native file drag events via pragmatic-drag-and-drop.
 *
 * @example
 * ```tsx
 * let dropZone: HTMLElement | null = null
 *
 * const { isOver, isDraggingFiles } = useFileDrop({
 *   element: () => dropZone,
 *   accept: ["image/*", ".pdf"],
 *   maxFiles: 5,
 *   onDrop: (files) => upload(files),
 * })
 *
 * <div
 *   ref={(el) => dropZone = el}
 *   class={isOver() ? "drop-active" : isDraggingFiles() ? "drop-ready" : ""}
 * >
 *   Drop files here
 * </div>
 * ```
 */
export function useFileDrop(options: UseFileDropOptions): UseFileDropResult {
  const isOver = signal(false)
  const isDraggingFiles = signal(false)
  let cleanup: (() => void) | undefined

  function matchesAccept(file: File, accept: string[]): boolean {
    return accept.some((pattern) => {
      if (pattern.startsWith('.')) {
        return file.name.toLowerCase().endsWith(pattern.toLowerCase())
      }
      if (pattern.endsWith('/*')) {
        return file.type.startsWith(pattern.slice(0, -1))
      }
      return file.type === pattern
    })
  }

  function setup() {
    if (cleanup) cleanup()

    const el = options.element()
    if (!el) return

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
          isOver.set(false)
          isDraggingFiles.set(false)

          let files = getFiles({ source })

          // Filter by accept
          if (options.accept && options.accept.length > 0) {
            files = files.filter((f) => matchesAccept(f, options.accept as string[]))
          }

          // Limit count
          if (options.maxFiles && files.length > options.maxFiles) {
            files = files.slice(0, options.maxFiles)
          }

          if (files.length > 0) {
            options.onDrop(files)
          }
        },
      }),
    )

    cleanup = () => {
      for (const fn of cleanups) fn()
    }
  }

  queueMicrotask(setup)

  onCleanup(() => {
    if (cleanup) cleanup()
  })

  return { isOver, isDraggingFiles }
}
