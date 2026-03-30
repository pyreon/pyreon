import { onCleanup, signal } from '@pyreon/reactivity'

export interface UseDialogResult {
  /** Whether the dialog is currently open. */
  open: () => boolean
  /** Open the dialog. */
  show: () => void
  /** Open as modal (with backdrop, traps focus). */
  showModal: () => void
  /** Close the dialog. */
  close: () => void
  /** Toggle open/closed state. */
  toggle: () => void
  /** Ref callback — pass to `ref` prop on a `<dialog>` element. */
  ref: (el: HTMLDialogElement) => void
}

/**
 * Signal-driven dialog management for the native `<dialog>` element.
 *
 * @example
 * ```tsx
 * const dialog = useDialog()
 *
 * <button onClick={dialog.showModal}>Open</button>
 * <dialog ref={dialog.ref}>
 *   <p>Modal content</p>
 *   <button onClick={dialog.close}>Close</button>
 * </dialog>
 * ```
 */
export function useDialog(options?: { onClose?: () => void }): UseDialogResult {
  const open = signal(false)
  let dialogEl: HTMLDialogElement | null = null
  let closeHandler: (() => void) | null = null

  const show = () => {
    dialogEl?.show()
    open.set(true)
  }

  const showModal = () => {
    dialogEl?.showModal()
    open.set(true)
  }

  const close = () => {
    dialogEl?.close()
    open.set(false)
  }

  const toggle = () => {
    if (open()) close()
    else showModal()
  }

  // Attach the close listener in the ref callback — guaranteed to have
  // the element. onMount fires at the same time as ref in Pyreon, but
  // ref is more reliable since it's called with the actual element.
  const ref = (el: HTMLDialogElement) => {
    // Clean up previous element if ref is called again
    if (dialogEl && closeHandler) {
      dialogEl.removeEventListener('close', closeHandler)
    }

    dialogEl = el

    closeHandler = () => {
      open.set(false)
      options?.onClose?.()
    }

    el.addEventListener('close', closeHandler)
  }

  onCleanup(() => {
    if (dialogEl && closeHandler) {
      dialogEl.removeEventListener('close', closeHandler)
    }
  })

  return { open, show, showModal, close, toggle, ref }
}
