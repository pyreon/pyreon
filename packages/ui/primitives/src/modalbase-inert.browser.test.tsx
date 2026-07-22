/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ModalBase background inert-ing (useInertOthers
 * wiring). `aria-modal="true"` only TELLS assistive tech the background is
 * inert; the useInertOthers hook makes it TRUE via the native `inert`
 * attribute — the background is unfocusable/unclickable and out of the
 * accessibility tree while the dialog is open, and restored on close.
 *
 * Bisect: remove the `useInertOthers(() => dialogEl())` call from ModalBase →
 * every spec here fails (background never gets `inert`).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ModalBase } from './ModalBase'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

function mountModal() {
  const open = signal(false)
  const modalProps: Record<string, unknown> = {
    'aria-label': 'Test dialog',
    onClose: () => open.set(false),
    children: [h('button', { 'data-testid': 'm1' }, 'First')],
  }
  Object.defineProperty(modalProps, 'open', {
    get: () => open(),
    enumerable: true,
    configurable: true,
  })
  const { container, unmount } = mountInBrowser(
    h(
      'div',
      null,
      h('button', { 'data-testid': 'opener' }, 'Open'),
      h(ModalBase as never, modalProps),
    ),
  )
  return { open, container, unmount }
}

describe('ModalBase — background inert (useInertOthers wiring)', () => {
  it('inerts background siblings while open, restores them on close', async () => {
    const { open, container, unmount } = mountModal()
    await flush()
    expect(container.hasAttribute('inert')).toBe(false)

    open.set(true)
    await nextFrame()
    // The dialog portals to document.body; the app container is a body-level
    // sibling → inert while the modal is open.
    expect(container.hasAttribute('inert')).toBe(true)
    const opener = container.querySelector<HTMLButtonElement>('[data-testid=opener]')!
    opener.focus()
    expect(document.activeElement).not.toBe(opener) // really unfocusable

    open.set(false)
    await nextFrame()
    expect(container.hasAttribute('inert')).toBe(false)
    unmount()
  })

  it('restores focus to the opener on close even though it was inert while open', async () => {
    const { open, container, unmount } = mountModal()
    await flush()
    const opener = container.querySelector<HTMLButtonElement>('[data-testid=opener]')!
    opener.focus()
    expect(document.activeElement).toBe(opener)

    open.set(true)
    await nextFrame()
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid=m1]'),
    )

    // The restore is microtask-deferred past the un-inert — a synchronous
    // restore would silently no-op against the still-inert opener.
    open.set(false)
    await nextFrame()
    expect(document.activeElement).toBe(opener)
    unmount()
  })

  it('unmounting an OPEN modal releases the inert background', async () => {
    const { open, container, unmount } = mountModal()
    await flush()
    open.set(true)
    await nextFrame()
    expect(container.hasAttribute('inert')).toBe(true)

    unmount()
    await flush()
    expect(container.hasAttribute('inert')).toBe(false)
  })
})
