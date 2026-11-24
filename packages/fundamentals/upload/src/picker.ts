// pyreon-lint-disable-file pyreon/no-window-in-ssr -- a detached input is made only when open() runs in the browser; its listeners are removed by dispose()
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- a detached input is made only when open() runs in the browser; its listeners are removed by dispose()
// pyreon-lint-disable-file pyreon/prefer-isserver -- a detached input is made only when open() runs in the browser; its listeners are removed by dispose()
import { getCurrentScope, signal } from '@pyreon/reactivity'

export interface FilePickerOptions {
  multiple?: boolean
  /** MIME patterns and extensions, as in the `accept` attribute. */
  accept?: readonly string[]
  /** Let the user pick a folder; every file in it is returned. */
  directory?: boolean
  /** Open the camera on phones: `'user'` (front) or `'environment'` (rear). */
  capture?: 'user' | 'environment' | boolean
  /** Called with the files each time the user picks. */
  onPick?(files: File[]): void
  /** Called when the user closes the dialog without choosing (browsers that report it). */
  onCancel?(): void
}

export interface FilePicker {
  /** Open the system file dialog. Call it from a click or key handler (browsers require a user gesture). */
  open(): void
  /** The files of the last pick. */
  files(): File[]
  /** Spread on an `<input>` you render (`<input {...picker.inputProps} />`). Optional: `open()` works without one. */
  inputProps: Record<string, unknown>
  /** Remove the hidden input and its listeners. Called for you when the picker was created in a component. */
  dispose(): void
}

/**
 * State for a file picker: a hidden `<input type="file">` wired so that choosing the same file twice works (the input is
 * emptied after each pick, after the files are copied out) and cancelling is reported. With no input rendered, `open()` makes
 * a detached one. Nothing touches the DOM until `open()`, so it is safe to create on the server.
 *
 * @example typeof useFilePicker({ accept: ['image/*'] }).open // => 'function'
 */
export function useFilePicker(options: FilePickerOptions = {}): FilePicker {
  const files = signal<File[]>([])
  let input: HTMLInputElement | null = null
  let detached: HTMLInputElement | null = null

  const onChange = (event: Event): void => {
    const el = event.target as HTMLInputElement
    const picked = Array.from(el.files ?? [])

    el.value = ''
    files.set(picked)
    options.onPick?.(picked)
  }
  const onCancel = (): void => options.onCancel?.()

  const attrs = (): Record<string, unknown> => ({
    type: 'file',
    tabIndex: -1,
    hidden: true,
    'aria-hidden': 'true',
    multiple: options.multiple === true,
    ...(options.accept === undefined ? {} : { accept: options.accept.join(',') }),
    ...(options.directory === true ? { webkitdirectory: true } : {}),
    ...(options.capture === undefined || options.capture === false ? {} : { capture: options.capture === true ? '' : options.capture }),
  })

  function makeDetached(): HTMLInputElement {
    const el = document.createElement('input')

    for (const [k, v] of Object.entries(attrs())) {
      if (typeof v === 'boolean') (el as unknown as Record<string, unknown>)[k] = v
      else el.setAttribute(k, String(v))
    }
    el.addEventListener('change', onChange)
    el.addEventListener('cancel', onCancel)

    return el
  }

  function dispose(): void {
    if (detached === null) return
    detached.removeEventListener('change', onChange)
    detached.removeEventListener('cancel', onCancel)
    detached = null
  }

  getCurrentScope()?.add(dispose)

  return {
    open() {
      if (typeof document === 'undefined') return
      const el = input ?? (detached ??= makeDetached())

      el.click()
    },
    files: () => files(),
    inputProps: { ...attrs(), onChange, onCancel, ref: (el: HTMLInputElement | null) => { input = el } },
    dispose,
  }
}
