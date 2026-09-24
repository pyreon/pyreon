/** @jsxImportSource @pyreon/core */
/**
 * How a `ModalBase` closes — Escape, the overlay, and where focus lands.
 *
 * Dismissal is the part of a dialog users interact with most and the part
 * that is easiest to get subtly wrong, because every wrong version still
 * closes the dialog SOMETIMES:
 *
 *   * **The overlay click must compare `target === currentTarget`.** Without
 *     it, any click inside the dialog bubbles to the overlay handler and
 *     closes it — so clicking a form field dismisses the form. Worse, a
 *     select-drag that starts on text and releases over the backdrop fires
 *     a click on the OVERLAY, which is why the check is on identity rather
 *     than on `contains`.
 *   * **Escape must be gated on `open`.** The keydown listener is on the
 *     document for the component's whole life, not just while open, so an
 *     ungated handler calls `onClose` on every Escape anywhere in the app —
 *     including for a dialog that is already closed, which a consumer
 *     counting closes will see as a phantom event.
 *   * **Initial focus is a three-step fallback**: the requested element,
 *     then the first focusable descendant, then the dialog itself. The last
 *     step is what stops focus staying on the opener behind the backdrop —
 *     where the user is tabbing through inert content they cannot see.
 *
 * `open` is a GETTER prop: this package's browser config uses the plain oxc
 * JSX transform, not the reactive-prop compiler.
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ModalBase } from './ModalBase'

let cleanups: Array<() => void> = []

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

function mountModal(
  extra: Record<string, unknown> = {},
  open: () => boolean = () => true,
  children: unknown = h('button', { 'data-testid': 'ok' }, 'OK'),
): void {
  const props: Record<string, unknown> = { ...extra, children }
  Object.defineProperty(props, 'open', { get: open, enumerable: true, configurable: true })
  const { unmount } = mountInBrowser(h(ModalBase as never, props))
  cleanups.push(unmount)
}

const escape = (): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

const dialog = (): HTMLElement =>
  document.querySelector<HTMLElement>('[role="dialog"],[role="alertdialog"]')!

describe('Escape', () => {
  it('closes an OPEN dialog', async () => {
    // The control for everything below.
    let closes = 0
    mountModal({ onClose: () => (closes += 1) })
    await flush()

    escape()
    expect(closes).toBe(1)
  })

  it('does NOT close when closeOnEscape is false', async () => {
    // A confirm-destructive dialog opts out so a stray Escape cannot
    // dismiss the decision.
    let closes = 0
    mountModal({ onClose: () => (closes += 1), closeOnEscape: false })
    await flush()

    escape()
    expect(closes).toBe(0)
  })

  it('does NOT fire for a CLOSED dialog', async () => {
    // The listener lives for the component's whole life, not just while
    // open. Ungated, every Escape anywhere in the app reaches every mounted
    // modal — a consumer counting closes sees phantom events.
    let closes = 0
    mountModal({ onClose: () => (closes += 1) }, () => false)
    await flush()

    escape()
    expect(closes).toBe(0)
  })

  it('ignores a different key', async () => {
    let closes = 0
    mountModal({ onClose: () => (closes += 1) })
    await flush()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(closes).toBe(0)
  })
})

describe('the overlay closes only on a click on ITSELF', () => {
  /**
   * The dialog element IS the overlay: `onClick` sits on the same node that
   * carries `role="dialog"`, and it fills the viewport with the content
   * inside it. There is no separate backdrop node — checked against the
   * rendered DOM, where the dialog's parent is `<body>`.
   */
  const overlay = (): HTMLElement => dialog()

  it('a click on the backdrop closes', async () => {
    let closes = 0
    mountModal({ onClose: () => (closes += 1) })
    await flush()

    const el = overlay()
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(closes, 'the backdrop is the dismiss affordance').toBe(1)
  })

  it('a click INSIDE the dialog does not', async () => {
    // The identity check. Without it any click that bubbles — a form
    // field, a button, a label — dismisses the dialog under the user.
    let closes = 0
    mountModal({ onClose: () => (closes += 1) })
    await flush()

    document
      .querySelector<HTMLElement>('[data-testid="ok"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(closes).toBe(0)
  })

  it('does not close when closeOnOverlay is false', async () => {
    let closes = 0
    mountModal({ onClose: () => (closes += 1), closeOnOverlay: false })
    await flush()

    overlay().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(closes).toBe(0)
  })
})

describe('focus moves into the dialog on open', () => {
  const settle = async (): Promise<void> => {
    await flush()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await flush()
  }

  it('lands on the first focusable descendant by default', async () => {
    // Leaving focus on the opener puts the user in inert content behind
    // the backdrop, tabbing through things they cannot see.
    mountModal()
    await settle()
    expect(document.activeElement?.getAttribute('data-testid')).toBe('ok')
  })

  it('honours initialFocus over the first focusable', async () => {
    // The canonical use: an alert dialog focusing the SAFE choice, so an
    // accidental Enter does not confirm a destructive action.
    //
    // The requested element must be INSIDE the dialog. An outside element
    // gets focus for a moment and the focus trap immediately pulls it back
    // — so a spec pointing at a detached button asserts the trap, not
    // `initialFocus`.
    mountModal(
      { initialFocus: () => document.querySelector<HTMLElement>('[data-testid="cancel"]') },
      () => true,
      [
        h('button', { 'data-testid': 'ok' }, 'OK'),
        h('button', { 'data-testid': 'cancel' }, 'Cancel'),
      ],
    )
    await settle()

    expect(
      document.activeElement?.getAttribute('data-testid'),
      'the SAFE choice, not the first focusable',
    ).toBe('cancel')
  })

  it('falls back to the DIALOG when nothing focusable is inside', async () => {
    // The third step of the chain, and the one that matters most: with no
    // focusable child and no requested element, focus would otherwise stay
    // where it was — outside the modal.
    mountModal({}, () => true, h('p', null, 'Just text'))
    await settle()

    expect(document.activeElement, 'the dialog itself takes focus').toBe(dialog())
  })
})
