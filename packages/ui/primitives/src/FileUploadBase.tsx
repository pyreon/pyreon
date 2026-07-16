import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mergeProps, splitProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface FileUploadBaseProps {
  /** Called when files are selected/dropped. */
  onChange?: (files: File[]) => void
  /** Accepted file types (MIME or extensions). */
  accept?: string[]
  /** Maximum number of files. */
  maxFiles?: number
  /** Maximum file size in bytes. */
  maxSize?: number
  /** Whether upload is disabled. */
  disabled?: boolean
  /**
   * Whether an upload is in progress — surfaced as `aria-busy` on the drop zone
   * so assistive tech announces the busy state. Toggle it around the async
   * upload the consumer runs in `onChange`.
   */
  busy?: boolean
  /**
   * Accessible name for the drop zone (→ `aria-label`). Defaults to a generic
   * upload instruction; override to describe the specific upload, or provide
   * visible instructions and spread `aria-labelledby` after `dropZoneProps`.
   */
  label?: string
  /** Allow multiple files. */
  multiple?: boolean
  /** Render function. */
  children?: (state: FileUploadState) => VNodeChild
  [key: string]: unknown
}

export interface FileUploadState {
  /** Whether files are being dragged over the zone. */
  isDragging: () => boolean
  /** Currently selected files. */
  files: () => File[]
  /** Open the native file picker. */
  openPicker: () => void
  /** Clear all files. */
  clear: () => void
  /** Remove a file by index. */
  removeFile: (index: number) => void
  /**
   * Props to spread on the drop zone element. Carries the WAI-ARIA button
   * pattern: `role="button"`, a keyboard-focusable `tabIndex`, `aria-label`,
   * and reactive `aria-disabled` / `aria-busy`, plus click + Enter/Space
   * activation that opens the native file picker.
   *
   * Also carries the component-level props forwarded from the consumer
   * (rocketstyle className/style, data-*, id…), since the drop zone is the
   * element a FileUpload wrapper's `.theme()` describes. This stays a plain
   * OBJECT (spread it directly — `{...state.dropZoneProps}`, no call), which is
   * why the type is widened to a record rather than kept exact.
   */
  dropZoneProps: Record<string, unknown>
  /** Ref for the hidden file input. */
  inputRef: (el: HTMLInputElement | null) => void
  /** Props to spread on the hidden file input element. */
  inputProps: {
    type: 'file'
    style: string
    multiple: boolean | undefined
    accept: string | undefined
    onChange: (e: Event) => void
  }
}

export const FileUploadBase: ComponentFn<FileUploadBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'onChange', 'accept', 'maxFiles', 'maxSize', 'disabled', 'busy', 'label', 'multiple', 'children',
  ])

  const DEFAULT_LABEL = 'Upload files. Activate to browse, or drag and drop files here.'

  function openPicker() {
    if (!own.disabled) inputEl?.click()
  }

  const isDragging = signal(false)
  const files = signal<File[]>([])
  let inputEl: HTMLInputElement | null = null

  function filterFiles(raw: File[]): File[] {
    let result = raw

    if (own.accept?.length) {
      result = result.filter((f) =>
        own.accept!.some((pattern) => {
          if (pattern.startsWith('.')) return f.name.toLowerCase().endsWith(pattern.toLowerCase())
          if (pattern.endsWith('/*')) return f.type.startsWith(pattern.slice(0, -1))
          return f.type === pattern
        }),
      )
    }

    if (own.maxSize) {
      result = result.filter((f) => f.size <= own.maxSize!)
    }

    if (own.maxFiles) {
      result = result.slice(0, own.maxFiles)
    }

    return result
  }

  function handleFiles(raw: File[]) {
    if (own.disabled) return
    const filtered = filterFiles(raw)
    files.set(filtered)
    own.onChange?.(filtered)
  }

  const state: FileUploadState = {
    isDragging,
    files,
    openPicker,
    clear: () => { files.set([]); own.onChange?.([]) },
    removeFile: (index) => {
      const next = files().filter((_, i) => i !== index)
      files.set(next)
      own.onChange?.(next)
    },
    // Forward the component-level props (rocketstyle className/style, data-*,
    // id…) onto the DROP ZONE — the element FileUpload's .theme() actually
    // describes (the dashed zone: border/padding/bg). This primitive renders no
    // element of its own, so without this the whole rocketstyle chain computed a
    // class that reached NO element and the component rendered UNSTYLED.
    // mergeProps (descriptor-safe) is required over object spread so a
    // getter-shaped reactive prop is not frozen — it also preserves the own
    // getters below; the primitive's own props are passed last and therefore win.
    dropZoneProps: mergeProps(rest as Record<string, unknown>, {
      // The drop zone is an activatable control: click or Enter/Space opens the
      // native picker (the WAI-ARIA button pattern), and it's the keyboard tab
      // stop. ARIA state that can change at runtime is exposed via getters so a
      // compiled `{...dropZoneProps}` spread stays reactive.
      role: 'button' as const,
      get tabIndex() { return own.disabled ? -1 : 0 },
      get 'aria-label'() { return own.label ?? DEFAULT_LABEL },
      get 'aria-disabled'() { return own.disabled ? 'true' : undefined },
      get 'aria-busy'() { return own.busy ? 'true' : undefined },
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        if (!own.disabled) isDragging.set(true)
      },
      onDragLeave: () => isDragging.set(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        isDragging.set(false)
        if (e.dataTransfer?.files) handleFiles(Array.from(e.dataTransfer.files))
      },
      onClick: openPicker,
      onKeyDown: (e: KeyboardEvent) => {
        if (own.disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault() // Space would otherwise scroll the page
          openPicker()
        }
      },
    } as Record<string, unknown>),
    inputRef: (el) => { inputEl = el },
    inputProps: {
      type: 'file' as const,
      style: 'display:none',
      multiple: own.multiple,
      accept: own.accept?.join(','),
      onChange: (e: Event) => {
        const input = e.target as HTMLInputElement
        if (input.files?.length) handleFiles(Array.from(input.files))
        input.value = ''
      },
    },
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: FileUploadState) => VNodeChild)(state)
  }
  return null
}
