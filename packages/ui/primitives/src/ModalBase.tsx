import { Portal, splitProps, type ComponentFn, type VNodeChild } from '@pyreon/core'
import { useEventListener, useFocusTrap, useScrollLock } from '@pyreon/hooks'
import { isServer, watch } from '@pyreon/reactivity'

// Tabbable descendants for the open-modal focus-in (mirrors the selector in
// @pyreon/hooks useFocusTrap, which owns the Tab-cycling itself).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalBaseProps {
  open?: boolean
  onClose?: () => void
  closeOnEscape?: boolean
  closeOnOverlay?: boolean
  'aria-labelledby'?: string
  'aria-describedby'?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless modal base — manages open state, ESC key, overlay click, scroll lock.
 *
 * Always mounts (for scroll lock + ESC to work reactively).
 * Renders children only when `open` is true.
 */
export const ModalBase: ComponentFn<ModalBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'open',
    'onClose',
    'closeOnEscape',
    'closeOnOverlay',
    'children',
    'ref',
  ])

  if (isServer) return null

  const closeOnEscape = own.closeOnEscape !== false
  const closeOnOverlay = own.closeOnOverlay !== false

  const scrollLock = useScrollLock()

  // Internal handle on the dialog element so we can trap + move focus. The
  // dialog renders only while open, so this is null when closed — which makes
  // the focus trap below inert without any extra gating. Forwarded to the
  // consumer's `ref` so they still get it.
  let dialogEl: HTMLElement | null = null
  // Element focused when the modal opened — restored on close so keyboard /
  // screen-reader users return to the trigger instead of the top of the page.
  let prevFocusEl: HTMLElement | null = null

  const dialogRef = (el: HTMLElement | null) => {
    dialogEl = el
    own.ref?.(el)
  }

  // Trap Tab / Shift+Tab within the dialog while it's open. `aria-modal="true"`
  // only TELLS assistive tech the rest of the page is inert — it does not stop
  // a sighted keyboard user tabbing out to the background. useFocusTrap reads
  // the getter live, so it's a no-op while closed (dialogEl is null). The
  // canonical multiplatform `<Modal>` (@pyreon/primitives) gets this from a
  // native `<dialog>`; this headless base hand-wires the equivalent.
  useFocusTrap(() => dialogEl)

  useEventListener('keydown', (e) => {
    if (own.open && closeOnEscape && e.key === 'Escape') own.onClose?.()
  })

  // `watch` (not `effect`) because this is a signal-REACTIVE side effect keyed
  // on `open` — the imperative DOM/scheduling work (focus, rAF) belongs on the
  // open/close transition, not at component setup. `immediate: true` preserves
  // the original effect's mount-run so a modal mounted already-open still locks
  // scroll + receives focus.
  watch(
    () => own.open,
    (isOpen) => {
      if (isOpen) {
        scrollLock.lock()
        // Capture the opener + move focus INTO the dialog so the trap has
        // somewhere to hold it (deferred a frame so the dialog has mounted —
        // it renders reactively after `open` flips).
        if (!isServer) {
          prevFocusEl = document.activeElement as HTMLElement | null
          requestAnimationFrame(() => {
            if (!own.open || !dialogEl) return
            const first = dialogEl.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
            ;(first ?? dialogEl).focus?.()
          })
        }
      } else {
        scrollLock.unlock()
        // Restore focus to the opener on close.
        const prev = prevFocusEl
        prevFocusEl = null
        if (prev && typeof prev.focus === 'function') prev.focus()
      }
    },
    { immediate: true },
  )

  const handleOverlayClick = (e: MouseEvent) => {
    if (closeOnOverlay && e.target === e.currentTarget) own.onClose?.()
  }

  return () => {
    if (!own.open) return null

    return (
      <Portal target={document.body}>
        <div
          tabIndex={-1}
          {...(rest as Record<string, unknown>)}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          onClick={handleOverlayClick}
        >
          {own.children}
        </div>
      </Portal>
    )
  }
}
