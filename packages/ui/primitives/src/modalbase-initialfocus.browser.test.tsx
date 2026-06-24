/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ModalBase's `initialFocus`. By default the dialog
 * focuses its first focusable descendant on open; `initialFocus` lets the
 * consumer focus a specific element instead — the canonical case being an
 * `alert` dialog for a destructive action, where focus should land on the SAFE
 * choice (Cancel) so an accidental Enter doesn't confirm.
 *
 * `open` is a GETTER prop (this package's browser config uses the plain oxc JSX
 * transform, not the reactive compiler). ModalBase portals into document.body,
 * so elements are queried off `document`.
 *
 * Bisect: revert the focus-in to `(first ?? dialogEl).focus()` → the
 * initialFocus spec fails (focus lands on the first button, not the requested).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ModalBase } from './ModalBase'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid=${id}]`)

function mountModal(withInitialFocus: boolean) {
  const open = signal(false)
  const props: Record<string, unknown> = {
    onClose: () => open.set(false),
    children: [
      h('button', { 'data-testid': 'confirm' }, 'Delete'),
      h('button', { 'data-testid': 'cancel' }, 'Cancel'),
    ],
  }
  Object.defineProperty(props, 'open', { get: () => open(), enumerable: true, configurable: true })
  if (withInitialFocus) props.initialFocus = () => q('cancel')
  const { unmount } = mountInBrowser(h(ModalBase as never, props))
  return { open, unmount }
}

describe('ModalBase — initialFocus', () => {
  it('focuses initialFocus() on open instead of the first focusable', async () => {
    const { open, unmount } = mountModal(true)
    await flush()
    open.set(true)
    await nextFrame() // focus-in is rAF-deferred
    expect(document.activeElement).toBe(q('cancel')) // the safe choice, not "Delete"
    unmount()
  })

  it('falls back to the first focusable when initialFocus is absent', async () => {
    const { open, unmount } = mountModal(false)
    await flush()
    open.set(true)
    await nextFrame()
    expect(document.activeElement).toBe(q('confirm'))
    unmount()
  })
})
