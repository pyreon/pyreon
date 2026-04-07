import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
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
  /** Props to spread on the drop zone element. */
  dropZoneProps: {
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
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
  const [own] = splitProps(props, [
    'onChange', 'accept', 'maxFiles', 'maxSize', 'disabled', 'multiple', 'children',
  ])

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
    openPicker: () => inputEl?.click(),
    clear: () => { files.set([]); own.onChange?.([]) },
    removeFile: (index) => {
      const next = files().filter((_, i) => i !== index)
      files.set(next)
      own.onChange?.(next)
    },
    dropZoneProps: {
      onDragOver: (e: DragEvent) => { e.preventDefault(); isDragging.set(true) },
      onDragLeave: () => isDragging.set(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        isDragging.set(false)
        if (e.dataTransfer?.files) handleFiles(Array.from(e.dataTransfer.files))
      },
    },
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
