/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ModalBase's dialog/alertdialog role. ModalBase
 * hardcoded `role="dialog"`; the new `alert` prop switches it to
 * `role="alertdialog"` for modals that interrupt with an urgent,
 * response-requiring message (confirmations, destructive warnings, errors) —
 * the WAI-ARIA distinction screen readers treat more assertively.
 *
 * ModalBase renders through a Portal into document.body, so the dialog is
 * queried off `document`. `open` is a GETTER prop (this package's browser
 * config uses the plain oxc JSX transform, not the reactive-prop compiler).
 *
 * Bisect: revert `role={own.alert ? 'alertdialog' : 'dialog'}` to the literal
 * `role="dialog"` → the alertdialog spec fails.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ModalBase } from './ModalBase'

function mountModal(extra: Record<string, unknown> = {}) {
  const props: Record<string, unknown> = {
    ...extra,
    children: h('button', { 'data-testid': 'ok' }, 'OK'),
  }
  // Render immediately + permanently open for the role assertion.
  Object.defineProperty(props, 'open', { get: () => true, enumerable: true, configurable: true })
  return mountInBrowser(h(ModalBase as never, props))
}

describe('ModalBase — dialog vs alertdialog role', () => {
  it('defaults to role="dialog"', async () => {
    const { unmount } = mountModal()
    await flush()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    unmount()
  })

  it('uses role="alertdialog" (still aria-modal) when alert is set', async () => {
    const { unmount } = mountModal({ alert: true })
    await flush()
    const dlg = document.querySelector('[role="alertdialog"]')
    expect(dlg).not.toBeNull()
    expect(dlg!.getAttribute('aria-modal')).toBe('true')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    unmount()
  })
})
