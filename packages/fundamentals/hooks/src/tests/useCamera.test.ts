import { describe, expect, it, vi } from 'vitest'
import { useCamera } from '../useCamera'

describe('useCamera', () => {
  it('is available when there is a DOM', () => {
    expect(useCamera().isAvailable()).toBe(true)
  })

  it('asks the browser for the CAMERA, not the gallery', async () => {
    // This attribute is the whole reason the web arm works: without it a
    // mobile browser opens the photo library instead. Desktop ignores it and
    // shows a file dialog, which is the honest degradation — there is no
    // camera flow to open there.
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })

    const cam = useCamera()
    const pending = cam.capture()
    const input = created[0]!
    expect(input.getAttribute('capture')).toBe('environment')
    expect(input.getAttribute('accept')).toBe('image/*')

    input.dispatchEvent(new Event('cancel'))
    await expect(pending).resolves.toBeNull()
    vi.restoreAllMocks()
  })

  it('a cancelled capture resolves null and removes the input', async () => {
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })

    const pending = useCamera().capture()
    const input = created[0]!
    input.dispatchEvent(new Event('cancel'))
    await expect(pending).resolves.toBeNull()
    // Without cleanup, every dismissed capture would leave a hidden input in
    // the DOM for the life of the page.
    expect(input.isConnected).toBe(false)
    vi.restoreAllMocks()
  })

  it('a taken photo resolves an object URL for the captured file', async () => {
    // The hook's MAIN path, and the one every existing spec skipped: they all
    // dismissed the sheet, so the branch that actually hands back a photo was
    // never executed.
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })
    const objectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:photo-1')

    const pending = useCamera().capture()
    const input = created[0]!
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))

    await expect(pending).resolves.toBe('blob:photo-1')
    expect(objectUrl).toHaveBeenCalledWith(file)
    // Same cleanup contract as the cancel path — a settled capture must not
    // leave its hidden input behind either.
    expect(input.isConnected).toBe(false)
    vi.restoreAllMocks()
  })

  it('a change event with NO file resolves null, not an empty URL', async () => {
    // Some engines fire `change` on dismissal instead of `cancel`. Minting an
    // object URL from an absent file would hand back a URL that renders
    // nothing — harder to debug than an explicit absence.
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })
    const objectUrl = vi.spyOn(URL, 'createObjectURL')

    const pending = useCamera().capture()
    const input = created[0]!
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    input.dispatchEvent(new Event('change'))

    await expect(pending).resolves.toBeNull()
    expect(objectUrl).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('settles ONCE — a change after a cancel cannot re-resolve', async () => {
    // `settle` guards this; without it the second event would call `resolve`
    // again (a no-op) but ALSO `input.remove()` a second time, and any future
    // rework of that path would silently double-fire.
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late')

    const pending = useCamera().capture()
    const input = created[0]!
    input.dispatchEvent(new Event('cancel'))
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'late.jpg')],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))

    // The FIRST settle wins: a late change must not turn a cancelled capture
    // into a photo.
    await expect(pending).resolves.toBeNull()
    vi.restoreAllMocks()
  })

  it('RESOLVES rather than rejecting — a caller branches, never catches', async () => {
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })
    const pending = useCamera().capture()
    created[0]!.dispatchEvent(new Event('cancel'))

    // Assert the SETTLE MODE explicitly: the contract is that this promise
    // resolves, so a caller writes `if (uri !== null)` rather than a
    // try/catch. `.rejects` would mean the contract had inverted.
    let rejected = false
    const uri = await pending.catch(() => {
      rejected = true
      return undefined
    })
    expect(rejected).toBe(false)
    expect(uri).toBeNull()
    vi.restoreAllMocks()
  })
})
