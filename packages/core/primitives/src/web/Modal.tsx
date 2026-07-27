// Web implementation of `<Modal>` — dialog overlay.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import type { ModalProps } from '../types/input'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Modal>` — dialog overlay built on the native `<dialog>` element.
 *
 * Compiles to:
 * - Web (this impl): `<dialog>` driven by `showModal()` / `close()`
 * - iOS (via PMTC): `.sheet(isPresented: ...) { ... }`
 * - Android (via PMTC): `Dialog(onDismissRequest = ...) { ... }`
 *
 * ## Why `<dialog>` + `showModal()`
 *
 * The native `<dialog>` in MODAL mode (entered ONLY via the imperative
 * `showModal()` — the `open` attribute gives a NON-modal dialog with no
 * focus trap / backdrop / top-layer) gives three hard-to-reimplement
 * behaviors for free: a real focus trap (Tab stays inside), the inert
 * backdrop, and top-layer stacking (renders above everything regardless
 * of z-index / overflow ancestors). So this impl reaches for the DOM
 * element imperatively rather than a hand-rolled focus-trap div.
 *
 * ## Single source of truth = the `open` prop
 *
 * Every close path (Escape, backdrop click) calls `onClose()` and does
 * NOT close the dialog itself — the consumer flips the `open` signal,
 * which drives `close()` through the effect. This keeps the dialog's
 * visibility a pure function of `open`; the dialog never desyncs from
 * the signal (e.g. Escape closing the DOM while the signal still says
 * open, then the effect re-opening it).
 *
 * `open` is read inside the effect (deferred thunk) — NOT at setup —
 * so Pyreon's compiler-emitted getter-shaped reactive prop tracks the
 * signal and re-runs the effect on change (same contract as `<Field>`'s
 * `value`; see that file for the #951 reactive-prop-read footgun).
 */
export const Modal = (props: ModalProps): VNode => {
  let dialogEl: HTMLDialogElement | null = null

  const getOpen = (): boolean => {
    const o = props.open
    return typeof o === 'function' ? (o as () => boolean)() : (o as boolean)
  }

  const applyOpen = (open: boolean): void => {
    const el = dialogEl
    if (el === null) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }

  const ref = (el: HTMLDialogElement | null): void => {
    dialogEl = el
    // Initial sync at mount — the effect's first run happened during
    // component setup when `dialogEl` was still null, so it could only
    // track `open`, not apply it. Apply the current value now.
    if (el !== null) applyOpen(getOpen())
  }

  // Reactive sync — tracks `open` and re-applies on every change.
  renderEffect(() => {
    applyOpen(getOpen())
  })

  // Escape: the native dialog fires `cancel` then self-closes. Prevent
  // the self-close and route through onClose so the `open` signal stays
  // the single source of truth.
  const onCancel = (e: Event): void => {
    e.preventDefault()
    props.onClose()
  }

  // Backdrop click: a click whose coordinates fall OUTSIDE the dialog's
  // own box is a backdrop click (the ::backdrop pseudo-element reports
  // its clicks as targeting the dialog). Geometry test is robust to any
  // content padding the consumer applies — no inner wrapper needed.
  const onClick = (e: MouseEvent): void => {
    // `currentTarget` is the <dialog> the handler is bound to — never
    // null mid-dispatch, so no guard needed (and nothing dead to cover).
    const el = e.currentTarget as HTMLDialogElement
    const r = el.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) props.onClose()
  }

  const style: Record<string, string> = {
    padding: '16px',
    border: 'none',
    'border-radius': '8px',
    'box-shadow': '0 10px 25px rgba(0, 0, 0, 0.15)',
    'max-width': '90vw',
    'max-height': '85vh',
  }

  return h(
    'dialog',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      ref,
      onCancel,
      onClick,
      style: mergePassthroughStyle(style, props.style),
    },
    props.children,
  )
}
