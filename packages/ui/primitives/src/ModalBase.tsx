import { Portal, splitProps, type ComponentFn, type VNodeChild } from '@pyreon/core'
import { useEventListener, useFocusTrap, useInertOthers, useScrollLock } from '@pyreon/hooks'
import { isServer, signal, watch } from '@pyreon/reactivity'

// Tabbable descendants for the open-modal focus-in (mirrors the selector in
// @pyreon/hooks useFocusTrap, which owns the Tab-cycling itself).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalBaseProps {
  open?: boolean
  onClose?: () => void
  closeOnEscape?: boolean
  closeOnOverlay?: boolean
  /**
   * Use `role="alertdialog"` instead of `role="dialog"`. Set this for modals
   * that interrupt the user with an urgent message requiring a response —
   * confirmations, destructive-action warnings, errors. Screen readers treat an
   * alertdialog more assertively (its content/label is announced immediately on
   * open). Leave it off for general-purpose dialogs.
   */
  alert?: boolean
  /**
   * Element to focus when the dialog opens, instead of the first focusable
   * descendant. Return the element from the getter (e.g. a ref). The canonical
   * use is an `alert` dialog for a destructive action: focus the SAFE choice
   * (Cancel) so an accidental Enter doesn't confirm. Falls back to the first
   * focusable, then the dialog itself, if the getter returns null.
   */
  initialFocus?: () => HTMLElement | null
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
    'alert',
    'initialFocus',
    'children',
    'ref',
  ])

  if (isServer) return null

  const closeOnEscape = own.closeOnEscape !== false
  const closeOnOverlay = own.closeOnOverlay !== false

  const scrollLock = useScrollLock()

  // Internal handle on the dialog element so we can trap + move focus. A
  // SIGNAL (not a plain let) so useInertOthers reactively follows the dialog's
  // mount/unmount — the dialog renders only while open, so this is null when
  // closed. Forwarded to the consumer's `ref` so they still get it.
  const dialogEl = signal<HTMLElement | null>(null)
  // Element focused when the modal opened — restored on close so keyboard /
  // screen-reader users return to the trigger instead of the top of the page.
  let prevFocusEl: HTMLElement | null = null
  // Dev-only nameless-dialog warning: once per INSTANCE, not per open.
  let warnedNoName = false

  const dialogRef = (el: HTMLElement | null) => {
    dialogEl.set(el)
    own.ref?.(el)
  }

  // Trap Tab / Shift+Tab + contain focusin within the dialog while it's open.
  // `active` is tied to `open` (not the hook's default lifetime-armed mode) so
  // STACKED modals push onto useFocusTrap's scope stack in OPEN order — the
  // most recently opened modal owns focus, and closing it reactivates the one
  // beneath. The canonical multiplatform `<Modal>` (@pyreon/primitives) gets
  // this from a native `<dialog>`; this headless base hand-wires the
  // equivalent.
  useFocusTrap(() => dialogEl(), { active: () => own.open === true })

  // Make the background ACTUALLY inert. `aria-modal="true"` (below) only
  // TELLS assistive tech the rest of the page is inert — it does not stop a
  // sighted keyboard/pointer user reaching the background, and some AT
  // ignores it. useInertOthers applies the native `inert` attribute to every
  // sibling subtree outside the dialog (refcounted for stacked modals,
  // exact-restore on close). The signal-backed getter IS the lifecycle:
  // applied when the dialog mounts, released when it unmounts.
  useInertOthers(() => dialogEl())

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
        // A dialog without an accessible name is announced as just "dialog" —
        // WAI-ARIA (APG dialog-modal pattern) requires aria-label or
        // aria-labelledby. Both live in `rest` (neither is split into `own`),
        // and the `in` operator checks KEY PRESENCE without firing the
        // descriptor-copied getters of reactive props.
        if (process.env.NODE_ENV !== 'production' && !warnedNoName) {
          const r = rest as object
          if (!('aria-label' in r) && !('aria-labelledby' in r)) {
            warnedNoName = true
            console.warn(
              '[Pyreon] <ModalBase> rendered without an accessible name — pass aria-label or aria-labelledby (WAI-ARIA dialog requires one).',
            )
          }
        }
        scrollLock.lock()
        // Capture the opener + move focus INTO the dialog so the trap has
        // somewhere to hold it (deferred a frame so the dialog has mounted —
        // it renders reactively after `open` flips).
        if (!isServer) {
          prevFocusEl = document.activeElement as HTMLElement | null
          requestAnimationFrame(() => {
            const el = dialogEl()
            if (!own.open || !el) return
            const requested = own.initialFocus?.() ?? null
            const first = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
            ;(requested ?? first ?? el).focus?.()
          })
        }
      } else {
        scrollLock.unlock()
        // Restore focus to the opener on close — deferred a microtask.
        // Within THIS synchronous flush the dialog may not have unmounted
        // yet, so useInertOthers can still hold `inert` over the opener's
        // subtree — and focusing an inert element is a silent no-op. Effects
        // flush synchronously, so by microtask time the dialog has unmounted
        // and the background is un-inerted (same reasoning as useFocusTrap's
        // deferred focusin recapture).
        const prev = prevFocusEl
        prevFocusEl = null
        if (prev && typeof prev.focus === 'function') {
          queueMicrotask(() => {
            // Re-opened before the restore fired — the open path owns focus.
            if (own.open) return
            prev.focus()
          })
        }
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
          role={own.alert ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          onClick={handleOverlayClick}
        >
          {own.children}
        </div>
      </Portal>
    )
  }
}
