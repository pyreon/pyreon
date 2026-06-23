/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ModalBase focus management. The headless modal set
 * `role="dialog"` + `aria-modal="true"` (which only TELLS assistive tech the
 * background is inert) but never trapped or moved keyboard focus — a sighted
 * keyboard user could Tab straight out to the background. This adds, while open:
 *   - focus-in on open (effect → first focusable, rAF-deferred),
 *   - Tab / Shift+Tab trap within the dialog (useFocusTrap),
 *   - focus restore to the opener on close.
 *
 * ModalBase renders through a Portal into document.body, so the dialog + its
 * buttons are queried off `document`, not the mount container. `open` is passed
 * as a GETTER prop (not JSX `open={sig()}`) because this package's browser
 * config uses the plain oxc JSX transform, not the Pyreon reactive-prop
 * compiler — a getter is what makes `own.open` track the signal. The trap is a
 * document keydown listener (useFocusTrap), so synthetic Tab dispatch on
 * document reaches it; the listener calls .focus() to wrap — that IS the move.
 *
 * Bisect: remove useFocusTrap → the wrap specs fail; remove the effect
 * focus-in / restore → those specs fail.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ModalBase } from './ModalBase'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

function q(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid=${id}]`)
}

function pressTab(shift = false): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }))
}

function mountModal() {
  const open = signal(false)
  // `open` as a reactive getter so `own.open` (via splitProps) tracks the
  // signal — the plain oxc JSX transform used by this package's browser config
  // would otherwise freeze `open={open()}` to its initial value.
  const modalProps: Record<string, unknown> = {
    onClose: () => open.set(false),
    children: [
      h('button', { 'data-testid': 'm1' }, 'First'),
      h('button', { 'data-testid': 'm2' }, 'Second'),
      h('button', { 'data-testid': 'm3' }, 'Third'),
    ],
  }
  Object.defineProperty(modalProps, 'open', { get: () => open(), enumerable: true, configurable: true })
  const { container, unmount } = mountInBrowser(
    h(
      'div',
      null,
      h('button', { 'data-testid': 'opener', onClick: () => open.set(true) }, 'Open'),
      h(ModalBase as never, modalProps),
    ),
  )
  const opener = container.querySelector('[data-testid=opener]') as HTMLButtonElement
  return { open, opener, unmount }
}

describe('ModalBase — focus management', () => {
  it('moves focus into the dialog on open (first focusable)', async () => {
    const { open, unmount } = mountModal()
    await flush()
    open.set(true)
    await nextFrame() // focus-in is rAF-deferred
    expect(document.activeElement).toBe(q('m1'))
    unmount()
  })

  it('Tab at the last focusable wraps to the first', async () => {
    const { open, unmount } = mountModal()
    await flush()
    open.set(true)
    await nextFrame()
    q('m3')!.focus()
    expect(document.activeElement).toBe(q('m3'))
    pressTab()
    expect(document.activeElement).toBe(q('m1'))
    unmount()
  })

  it('Shift+Tab at the first focusable wraps to the last', async () => {
    const { open, unmount } = mountModal()
    await flush()
    open.set(true)
    await nextFrame()
    q('m1')!.focus()
    expect(document.activeElement).toBe(q('m1'))
    pressTab(true)
    expect(document.activeElement).toBe(q('m3'))
    unmount()
  })

  it('restores focus to the opener on close', async () => {
    const { open, opener, unmount } = mountModal()
    await flush()
    opener.focus()
    expect(document.activeElement).toBe(opener)
    open.set(true) // captures opener as the restore target
    await nextFrame() // focus moves into the dialog
    expect(document.activeElement).toBe(q('m1'))
    open.set(false) // close → restore
    await flush()
    expect(document.activeElement).toBe(opener)
    unmount()
  })

  it('does not trap once closed (Tab is a no-op)', async () => {
    const { open, opener, unmount } = mountModal()
    await flush()
    open.set(true)
    await nextFrame()
    open.set(false)
    await flush()
    opener.focus()
    pressTab() // dialog gone → useFocusTrap getter returns null → no wrap
    expect(document.activeElement).toBe(opener)
    unmount()
  })
})
