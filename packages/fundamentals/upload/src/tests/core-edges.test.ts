// The core entry at its edges, under the unit runner. Image decoding is the browser's `createImageBitmap`; here it is a stub
// that answers with a size (or fails), so the rules can be checked exactly. The real decode of a real image is
// `upload.browser.test.ts` ("image rules decode a real PNG") in Chromium.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectDropped, collectPasted, matchesAccept, validateFile, validateFileAsync, validateFiles } from '../core'
import type { FileRejection } from '../types'
import { file } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** `createImageBitmap` answering with a fixed size; records whether each bitmap was closed. */
function bitmaps(width: number, height: number) {
  const closed: boolean[] = []

  vi.stubGlobal('createImageBitmap', async () => {
    const i = closed.push(false) - 1

    return { width, height, close: () => { closed[i] = true } }
  })

  return closed
}

const png = (): File => file('a.png', 10, 'image/png')
const check = async (rule: NonNullable<Parameters<typeof validateFile>[1]['image']>): Promise<FileRejection[]> => validateFileAsync(png(), { image: rule })

describe('validateFile: image rules', () => {
  it('reads the size, frees the bitmap, and accepts an image inside every limit', async () => {
    const closed = bitmaps(800, 600)

    expect(await check({ maxWidth: 800, maxHeight: 600, minWidth: 800, minHeight: 600, aspect: 4 / 3 })).toEqual([])
    expect(closed).toEqual([true])
  })

  it('names every limit an image breaks, with the size and the rule in params', async () => {
    bitmaps(1000, 100)
    const [r] = await check({ maxWidth: 800, minHeight: 200, aspect: 1 })

    expect(r).toMatchObject({ code: 'dimensions', message: 'The image is 1000 x 100; it must be at most 800 px wide and at least 200 px high and of a different shape.', params: { width: 1000, height: 100, maxWidth: 800, minHeight: 200, aspect: 1, name: 'a.png' } })
    bitmaps(10, 1000)
    expect((await check({ maxHeight: 500, minWidth: 20 }))[0]!.message).toBe('The image is 10 x 1000; it must be at most 500 px high and at least 20 px wide.')
  })

  it('a numeric aspect allows 1% either way; a range checks each end it has', async () => {
    bitmaps(1009, 1000)
    expect(await check({ aspect: 1 })).toEqual([])
    bitmaps(1011, 1000)
    expect(await check({ aspect: 1 })).toHaveLength(1)
    bitmaps(1600, 900)
    expect(await check({ aspect: { min: 1, max: 2 } })).toEqual([])
    expect(await check({ aspect: { min: 2 } })).toHaveLength(1)
    expect(await check({ aspect: { max: 1.5 } })).toHaveLength(1)
    expect(await check({ aspect: {} })).toEqual([])
  })

  it('an image with no height has no shape to compare, so aspect is not judged', async () => {
    bitmaps(10, 0)
    expect(await check({ aspect: 1 })).toEqual([])
  })

  it('a file the browser cannot decode, or a host without createImageBitmap, is "could not be read"', async () => {
    vi.stubGlobal('createImageBitmap', async () => { throw new DOMException('bad image', 'InvalidStateError') })
    expect(await check({ maxWidth: 1 })).toEqual([{ code: 'dimensions', message: 'The image could not be read.', params: { name: 'a.png' } }])
    vi.stubGlobal('createImageBitmap', undefined)
    expect((await check({ maxWidth: 1 }))[0]!.message).toBe('The image could not be read.')
  })
})

describe('validateFile: custom rules and argument checks', () => {
  it('a custom rule that throws a non-Error rejects with a generic message', async () => {
    expect(await validateFileAsync(png(), { custom: () => { throw 42 } })).toEqual([{ code: 'custom', message: 'The file was not accepted.', params: { name: 'a.png' } }])
  })

  it('validateFileAsync is a Promise even for a synchronous answer', async () => {
    const p = validateFileAsync(png(), { maxSize: 1 })

    expect(p).toBeInstanceOf(Promise)
    expect((await p)[0]!.code).toBe('too-large')
  })

  it('a custom rule that is not a function is refused with the expected shape', () => {
    expect(() => validateFile(png(), { custom: 'no' as never })).toThrow('[Pyreon] validateFile: expected custom to be a function (file) => message | null.')
  })

  it('validateFiles with maxFiles of one says "file is"', async () => {
    const [, b] = await validateFiles([png(), png()], { maxFiles: 1 })

    expect(b![0]!.message).toBe('At most 1 file is allowed.')
  })
})

describe('matchesAccept', () => {
  it('an object without a type matches only by extension', () => {
    expect(matchesAccept({ name: 'a.csv' } as never, ['.csv'])).toBe(true)
    expect(matchesAccept({ name: 'a.csv' } as never, ['text/csv'])).toBe(false)
  })
})

describe('collectDropped and collectPasted: hosts and folders', () => {
  const item = (f: File | null, entry?: unknown): DataTransferItem => ({ kind: 'file', type: '', getAsFile: () => f, ...(entry === undefined ? {} : { webkitGetAsEntry: () => entry }) }) as unknown as DataTransferItem
  const fileEntry = (f: File) => ({ isFile: true, isDirectory: false, name: f.name, file: (ok: (x: File) => void) => ok(f) })

  it('a DataTransfer without items (an old host) gives its files; one with neither gives nothing', async () => {
    const a = file('a')

    expect(await collectDropped({ files: [a] } as unknown as DataTransfer)).toEqual([a])
    expect(await collectDropped({} as DataTransfer)).toEqual([])
    expect(collectPasted({ files: [a] } as unknown as DataTransfer)).toEqual([a])
    expect(collectPasted({ items: [] } as unknown as DataTransfer)).toEqual([])
  })

  it('when some items have entries, only those are read; an entry that is neither file nor folder is skipped', async () => {
    const a = file('a')
    const b = file('b')
    const odd = { isFile: false, isDirectory: false, name: 'socket' }

    expect(await collectDropped({ items: [item(a, fileEntry(a)), item(b, null), item(null, odd)], files: [] } as unknown as DataTransfer)).toEqual([a])
  })

  it('a folder that contains itself (a symlink loop) is read 64 levels deep and then stopped', async () => {
    const inner = file('x')
    const loop: Record<string, unknown> = { isFile: false, isDirectory: true, name: 'loop' }

    loop.createReader = () => {
      let served = false

      // Like the real API, entries arrive in a later task, in batches, ending with an empty one.
      return { readEntries: (ok: (e: unknown[]) => void) => { const batch = served ? [] : [fileEntry(inner), loop]; served = true; queueMicrotask(() => ok(batch)) } }
    }
    const out = await collectDropped({ items: [item(null, loop)], files: [] } as unknown as DataTransfer)

    expect(out).toHaveLength(64)
  })

  it('a folder that cannot be listed rejects (the drop handler reports it)', async () => {
    const broken = { isFile: false, isDirectory: true, name: 'd', createReader: () => ({ readEntries: (_ok: unknown, fail: (e: unknown) => void) => fail(new DOMException('gone', 'NotFoundError')) }) }

    await expect(collectDropped({ items: [item(null, broken)], files: [] } as unknown as DataTransfer)).rejects.toThrow('gone')
  })
})
