import { describe, expect, it, vi } from 'vitest'
import { useFilePicker } from '../useFilePicker'

/**
 * Drive the hidden `<input type="file">` the web fallback mounts. happy-dom
 * never opens a real file dialog, so `input.click()` returns without settling —
 * the test plays the browser's part by dispatching the event the user's choice
 * (or dismissal) would produce.
 */
function withFileInput(act: (input: HTMLInputElement) => void): void {
  const realClick = HTMLInputElement.prototype.click
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    // Settle asynchronously, as a real dialog would.
    queueMicrotask(() => act(this))
  })
  void realClick
}

describe('useFilePicker', () => {
  it('resolves an object URL for the picked file', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:pyreon/doc')
    const file = new File(['x'], 'report.pdf', { type: 'application/pdf' })

    withFileInput((input) => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change'))
    })

    await expect(useFilePicker().pick()).resolves.toBe('blob:pyreon/doc')
    expect(createObjectURL).toHaveBeenCalledWith(file)
    vi.restoreAllMocks()
  })

  it('does not restrict the accept type (a document picker takes any file)', async () => {
    // Distinct from useImagePicker (which sets accept="image/*"): the file
    // picker leaves accept unset so any file type is offered.
    let capturedAccept = '<unset-sentinel>'
    withFileInput((input) => {
      capturedAccept = input.accept
      input.dispatchEvent(new Event('cancel'))
    })
    await useFilePicker().pick()
    expect(capturedAccept).toBe('')
    vi.restoreAllMocks()
  })

  it('resolves null when the picker is cancelled', async () => {
    withFileInput((input) => input.dispatchEvent(new Event('cancel')))
    await expect(useFilePicker().pick()).resolves.toBeNull()
    vi.restoreAllMocks()
  })

  it('resolves null on a change event carrying no file', async () => {
    // Some browsers report a dismissal as an empty `change` rather than `cancel`.
    withFileInput((input) => {
      Object.defineProperty(input, 'files', { value: [], configurable: true })
      input.dispatchEvent(new Event('change'))
    })
    await expect(useFilePicker().pick()).resolves.toBeNull()
    vi.restoreAllMocks()
  })

  it('detaches the input once settled (no DOM leak per pick)', async () => {
    withFileInput((input) => input.dispatchEvent(new Event('cancel')))
    const before = document.querySelectorAll('input[type="file"]').length
    await useFilePicker().pick()
    expect(document.querySelectorAll('input[type="file"]').length).toBe(before)
    vi.restoreAllMocks()
  })

  it('settles once even if both change and cancel fire', async () => {
    withFileInput((input) => {
      Object.defineProperty(input, 'files', { value: [], configurable: true })
      input.dispatchEvent(new Event('change'))
      input.dispatchEvent(new Event('cancel'))
    })
    await expect(useFilePicker().pick()).resolves.toBeNull()
    vi.restoreAllMocks()
  })

  it('isAvailable() is true in a DOM environment', () => {
    expect(useFilePicker().isAvailable()).toBe(true)
  })
})
