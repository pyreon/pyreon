import { describe, expect, it, vi } from 'vitest'
import { useDialog } from '../useDialog'

function createMockDialog(): HTMLDialogElement {
  const el = document.createElement('dialog') as HTMLDialogElement
  // happy-dom may not fully implement dialog methods
  el.show = vi.fn()
  el.showModal = vi.fn()
  el.close = vi.fn()
  return el
}

describe('useDialog', () => {
  it('initializes with open=false', () => {
    const { open } = useDialog()
    expect(open()).toBe(false)
  })

  it('show opens the dialog', () => {
    const { open, show, ref } = useDialog()
    const el = createMockDialog()
    ref(el)

    show()
    expect(open()).toBe(true)
    expect(el.show).toHaveBeenCalled()
  })

  it('showModal opens as modal', () => {
    const { open, showModal, ref } = useDialog()
    const el = createMockDialog()
    ref(el)

    showModal()
    expect(open()).toBe(true)
    expect(el.showModal).toHaveBeenCalled()
  })

  it('close closes the dialog', () => {
    const { open, show, close, ref } = useDialog()
    const el = createMockDialog()
    ref(el)

    show()
    expect(open()).toBe(true)

    close()
    expect(open()).toBe(false)
    expect(el.close).toHaveBeenCalled()
  })

  it('toggle toggles between open and closed', () => {
    const { open, toggle, ref } = useDialog()
    const el = createMockDialog()
    ref(el)

    toggle()
    expect(open()).toBe(true) // was closed, now open via showModal

    toggle()
    expect(open()).toBe(false) // was open, now closed
  })

  it('native close event updates open signal', () => {
    const onClose = vi.fn()
    const { open, show, ref } = useDialog({ onClose })
    const el = createMockDialog()
    ref(el)

    show()
    expect(open()).toBe(true)

    // Simulate native close event
    el.dispatchEvent(new Event('close'))
    expect(open()).toBe(false)
    expect(onClose).toHaveBeenCalled()
  })

  it('ref can be called multiple times (cleans up previous)', () => {
    const { ref } = useDialog()
    const el1 = createMockDialog()
    const el2 = createMockDialog()

    ref(el1)
    ref(el2)

    // Should not throw — previous listener cleaned up
    el1.dispatchEvent(new Event('close'))
  })

  it('works without ref element', () => {
    const { show, close, toggle } = useDialog()
    // Should not throw when no element is attached
    expect(() => show()).not.toThrow()
    expect(() => close()).not.toThrow()
    expect(() => toggle()).not.toThrow()
  })

  // REGRESSION: Pyreon's RefCallback contract is `(el: T | null) => void` —
  // refs fire with `null` on unmount. `useDialog`'s `ref` declared its
  // parameter as `(el: HTMLDialogElement) => void` (lying type) AND tried to
  // call `el.addEventListener('close', ...)` on the null path, throwing
  // `TypeError: Cannot read properties of null`. The `onCleanup` listener
  // removal at the bottom of the function was correct, but the crash on the
  // ref-with-null call fired BEFORE cleanup could even register intent.
  it('REGRESSION: ref(null) on unmount does not throw and cleans up the close listener', () => {
    const onClose = vi.fn()
    const { ref } = useDialog({ onClose })
    const el = createMockDialog()

    ref(el)

    // Pyreon's runtime-dom invokes the ref with `null` when the element
    // unmounts. The type signature said `HTMLDialogElement`, but the
    // runtime contract is `HTMLDialogElement | null`.
    expect(() => (ref as (el: HTMLDialogElement | null) => void)(null)).not.toThrow()

    // After unmount, dispatching a close event on the OLD element must not
    // re-trigger the handler (listener was removed).
    el.dispatchEvent(new Event('close'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
