import { onMount } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"

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

  const ref = (el: HTMLDialogElement) => {
    dialogEl = el
  }

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

  // Sync `open` signal when dialog is closed via Escape key or form submission
  onMount(() => {
    const handler = () => {
      open.set(false)
      options?.onClose?.()
    }
    dialogEl?.addEventListener("close", handler)
    return () => dialogEl?.removeEventListener("close", handler)
  })

  return { open, show, showModal, close, toggle, ref }
}
