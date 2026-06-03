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
  /**
   * Ref callback — pass to `ref` prop on a `<dialog>` element.
   *
   * Pyreon's `RefCallback<T>` contract: refs fire with the element on
   * mount and with `null` on unmount. `useDialog`'s ref handles both —
   * the null call removes the bound `close` listener and clears the
   * internal element reference.
   */
  ref: (el: HTMLDialogElement | null) => void
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

  // Attach the close listener in the ref callback. Pyreon's RefCallback
  // contract fires the ref with the element on mount AND with `null` on
  // unmount — early-return on the null path after cleaning up the previous
  // binding. The pre-fix `el.addEventListener('close', …)` after assigning
  // `dialogEl = null` would throw `TypeError: Cannot read properties of
  // null` on every component unmount.
  const ref = (el: HTMLDialogElement | null) => {
    // Clean up previous element if ref is called again (re-bind or unmount)
    if (dialogEl && closeHandler) {
      dialogEl.removeEventListener('close', closeHandler)
    }

    dialogEl = el
    closeHandler = null

    if (el === null) return

    closeHandler = () => {
      open.set(false)
      options?.onClose?.()
    }
    el.addEventListener('close', closeHandler)
  }

  onCleanup(() => {
    /* v8 ignore next 3 — defensive null guards; structurally exercised on mount but cleanup-time states not all covered */
    if (dialogEl && closeHandler) {
      dialogEl.removeEventListener('close', closeHandler)
    }
  })

  return { open, show, showModal, close, toggle, ref }
}
