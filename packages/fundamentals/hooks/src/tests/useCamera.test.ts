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

  it('never throws — cancel and unavailable are the same outcome to a caller', async () => {
    const created: HTMLInputElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'input') created.push(el as HTMLInputElement)
      return el
    })
    const pending = useCamera().capture()
    created[0]!.dispatchEvent(new Event('cancel'))
    await expect(pending).resolves.not.toThrow
    vi.restoreAllMocks()
  })
})
