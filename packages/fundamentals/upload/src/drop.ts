// pyreon-lint-disable-file pyreon/prefer-isserver -- the drag end listeners live on window and are removed when the drag ends; `typeof window` keeps the code testable with a bare window
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the drag end listeners live on window and are removed when the drag ends; `typeof window` keeps the code testable with a bare window
import { getCurrentScope, signal } from '@pyreon/reactivity'
import { matchesAccept } from './accept'
import { collectDropped, collectPasted } from './collect'
import type { FileRejection } from './types'

export interface FileDropOptions {
  /** MIME patterns and extensions; a drop of other files is refused and reported with `onReject`. */
  accept?: readonly string[]
  /** Allow several files in one drop. Default true; with `false` only the first is kept. */
  multiple?: boolean
  disabled?: boolean
  /** Read dropped folders and flatten them (when the browser can). Default true. */
  directories?: boolean
  /** Also take files pasted onto the element (it must be focusable to receive paste). Default false. */
  paste?: boolean
  onDrop?(files: File[]): void
  onReject?(rejected: { file: File; rejection: FileRejection }[]): void
}

export interface FileDrop {
  /** True while files are dragged over the zone (also over its children: enter and leave are counted). */
  isOver(): boolean
  /** While dragging: `false` when the dragged files cannot be accepted (by type or count), `true` when they can; `null` otherwise. */
  isValid(): boolean | null
  /** Spread on the drop element. */
  dropProps: Record<string, unknown>
  dispose(): void
}

const hasFiles = (e: DragEvent): boolean => e.dataTransfer !== null && Array.from(e.dataTransfer.types ?? []).includes('Files')

function judge(data: DataTransfer | null, options: FileDropOptions): boolean {
  const items = data === null ? [] : Array.from(data.items ?? []).filter((i) => i.kind === 'file')

  if (options.multiple === false && items.length > 1) return false
  if (options.accept === undefined || options.accept.length === 0) return true
  // During a drag the browser tells only the MIME type, not the name: an item without a type cannot be judged, so it passes.
  return items.every((i) => i.type === '' || matchesAccept({ type: i.type }, options.accept!.filter((p) => !p.startsWith('.')).length > 0 ? options.accept!.filter((p) => !p.startsWith('.')) : ['*/*']))
}

/**
 * State and handlers for a file drop zone. Drag enter and leave are counted, so moving over the zone's children does not make it
 * flicker; the dragged files are judged against `accept` while dragging (`isValid`); folders are read when the browser allows;
 * paste is optional. Spread `dropProps` on an element. Nothing touches the DOM until an event arrives, so it is safe to create on
 * the server.
 *
 * @example typeof useFileDrop({ accept: ['image/*'] }).dropProps.onDrop // => 'function'
 */
export function useFileDrop(options: FileDropOptions = {}): FileDrop {
  const over = signal(false)
  const valid = signal<boolean | null>(null)
  let depth = 0
  let listening = false

  const reset = (): void => {
    depth = 0
    over.set(false)
    valid.set(null)
    unlisten()
  }
  const onWindowEnd = (): void => reset()

  function listen(): void {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('drop', onWindowEnd, true)
    window.addEventListener('dragend', onWindowEnd, true)
  }

  function unlisten(): void {
    if (!listening || typeof window === 'undefined') return
    listening = false
    window.removeEventListener('drop', onWindowEnd, true)
    window.removeEventListener('dragend', onWindowEnd, true)
  }

  function take(files: File[]): void {
    const rejected: { file: File; rejection: FileRejection }[] = []
    const accepted: File[] = []

    for (const file of files) {
      if (options.accept !== undefined && !matchesAccept(file, options.accept)) rejected.push({ file, rejection: { code: 'type', message: 'Files of this type are not accepted.', params: { type: file.type, accept: options.accept, name: file.name } } })
      else if (options.multiple === false && accepted.length >= 1) rejected.push({ file, rejection: { code: 'too-many', message: 'Only one file is allowed.', params: { max: 1 } } })
      else accepted.push(file)
    }
    if (rejected.length > 0) options.onReject?.(rejected)
    if (accepted.length > 0) options.onDrop?.(accepted)
  }

  const dropProps: Record<string, unknown> = {
    onDragEnter(e: DragEvent) {
      if (options.disabled === true || !hasFiles(e)) return
      e.preventDefault()
      depth++
      if (depth === 1) {
        over.set(true)
        valid.set(judge(e.dataTransfer, options))
        listen()
      }
    },
    onDragOver(e: DragEvent) {
      if (options.disabled === true || !hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = valid() === false ? 'none' : 'copy'
    },
    onDragLeave(e: DragEvent) {
      if (depth === 0 || !hasFiles(e)) return
      depth--
      if (depth === 0) reset()
    },
    onDrop(e: DragEvent) {
      if (options.disabled === true || !hasFiles(e)) return
      e.preventDefault()
      reset()
      void collectDropped(e.dataTransfer, { directories: options.directories !== false }).then(take)
    },
    get 'data-drag-over'() {
      return over() ? 'true' : undefined
    },
    get 'data-drop-valid'() {
      return valid() === null ? undefined : String(valid())
    },
    ...(options.paste === true
      ? {
          onPaste(e: ClipboardEvent) {
            if (options.disabled === true) return
            const files = collectPasted(e.clipboardData)

            if (files.length === 0) return
            e.preventDefault()
            take(files)
          },
        }
      : {}),
  }

  getCurrentScope()?.add(reset)

  return { isOver: () => over(), isValid: () => valid(), dropProps, dispose: reset }
}
