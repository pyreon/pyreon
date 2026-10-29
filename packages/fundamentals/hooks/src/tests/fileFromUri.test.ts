import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileFromUri } from '../fileFromUri'
import { useFilePicker } from '../useFilePicker'

/**
 * `fileFromUri` is the step between a picker's URI and an upload. A URI is a handle, not the file: sending it as a
 * body sends its TEXT. On the web the picker's own `File` is returned when the URI came from a picker (its real name
 * and type), else the bytes are read through `fetch`.
 */
afterEach(() => {
  vi.restoreAllMocks()
})

/** Pick `file` through the real `useFilePicker`, as a user would. */
async function pick(file: File): Promise<string> {
  const realCreate = document.createElement.bind(document)
  let input: HTMLInputElement | undefined
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag)
    if (tag === 'input') input = el as HTMLInputElement
    return el
  })
  let open: (() => Promise<string | null>) | undefined
  const owner = effect(() => {
    open = useFilePicker().pick
  })
  const pending = open!()
  spy.mockRestore()
  Object.defineProperty(input!, 'files', { value: [file] })
  input!.dispatchEvent(new Event('change'))
  const uri = await pending
  owner.dispose()
  expect(uri).not.toBeNull()
  return uri as string
}

describe('fileFromUri', () => {
  it("returns the picker's own File for a URI it handed out — name and type intact", async () => {
    const file = new File(['png bytes'], 'holiday.png', { type: 'image/png' })
    const uri = await pick(file)
    expect(await fileFromUri(uri)).toBe(file)
  })

  it('an explicit name / type rebrands the picked bytes without re-reading them', async () => {
    const file = new File(['data'], 'IMG_0001.HEIC', { type: 'image/heic' })
    const uri = await pick(file)
    const out = await fileFromUri(uri, { name: 'avatar.jpg', type: 'image/jpeg' })
    expect(out.name).toBe('avatar.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(await out.text()).toBe('data')
  })

  it('any other URI is read through fetch, named by its last path segment', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['abc'], { type: 'text/csv' })),
    )
    const out = await fileFromUri('https://cdn.test/exports/r%C3%A9port.csv?sig=1#x')
    expect(fetchSpy).toHaveBeenCalledWith('https://cdn.test/exports/r%C3%A9port.csv?sig=1#x')
    expect(out.name).toBe('réport.csv')
    expect(out.type).toBe('text/csv')
    expect(await out.text()).toBe('abc')
  })

  it('a data: or blob: URI is named "blob", as FormData names an anonymous Blob', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Blob(['x'])))
    expect((await fileFromUri('data:,x')).name).toBe('blob')
    expect((await fileFromUri('blob:https://app.test/1234')).name).toBe('blob')
  })

  it('rejects when the URI cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fileFromUri('https://cdn.test/missing.png')).rejects.toThrow('Failed to fetch')
  })

  it('remembers a bounded number of picked files — the oldest falls back to a fetch read', async () => {
    const first = new File(['first'], 'first.txt', { type: 'text/plain' })
    const firstUri = await pick(first)
    for (let i = 0; i < 32; i++) await pick(new File([String(i)], `f${i}.txt`))
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['first'])))
    const out = await fileFromUri(firstUri)
    expect(out).not.toBe(first)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await out.text()).toBe('first')
  })
})
