import { describe, expect, it } from 'vitest'
import { chunkCount, chunkRange, collectDropped, collectPasted, createSpeedMeter, defaultBackoff, errorFromStatus, formatSize, isRetryableStatus, isUploadError, matchesAccept, monotonic, parseRetryAfter, parseSize, planChunks, progressOf, remainingMs, sniffBytes, sniffType, suggestChunkSize, sumProgress, toUploadError, uploadError, validateFile, validateFiles } from '../core'
import { file } from './helpers'
import { int, pick, rng } from './rng'

describe('parseSize and formatSize', () => {
  it('reads bytes and text with decimal and binary units', () => {
    expect(parseSize(512)).toBe(512)
    expect(parseSize('10 MB')).toBe(10_000_000)
    expect(parseSize('10mb')).toBe(10_000_000)
    expect(parseSize('1.5 MiB')).toBe(1_572_864)
    expect(parseSize('2 GiB')).toBe(2 * 1024 ** 3)
    expect(parseSize(' 100 ')).toBe(100)
    expect(parseSize('0')).toBe(0)
  })

  it('refuses nonsense with a [Pyreon] RangeError that shows the fix', () => {
    for (const bad of ['', 'big', '10 XB', '-1', '1e3', NaN, Infinity, -5, '10 MB 5', null as never, undefined as never, {} as never]) {
      expect(() => parseSize(bad as never), String(bad)).toThrow(/^\[Pyreon\] parseSize: .*(size|Pass bytes)/)
    }
  })

  it('formats for messages', () => {
    expect(formatSize(999)).toBe('999 B')
    expect(formatSize(1500)).toBe('1.5 KB')
    expect(formatSize(10_000_000)).toBe('10 MB')
    expect(formatSize(2.5e12)).toBe('2.5 TB')
  })
})

describe('matchesAccept', () => {
  it('matches MIME types, wildcards and extensions, ignoring case and parameters', () => {
    expect(matchesAccept({ name: 'a.png', type: 'image/png' }, ['image/*'])).toBe(true)
    expect(matchesAccept({ name: 'a.png', type: 'IMAGE/PNG; x=1' }, ['image/png'])).toBe(true)
    expect(matchesAccept({ name: 'A.CSV', type: '' }, ['.csv'])).toBe(true)
    expect(matchesAccept({ name: 'a.txt', type: 'text/plain' }, ['image/*', '.csv'])).toBe(false)
    expect(matchesAccept({ name: 'x', type: '' }, ['*/*'])).toBe(true)
    expect(matchesAccept({ name: 'x', type: 'a/b' }, [])).toBe(true)
  })

  it('a bare extension is not a file called ".csv", and a missing type matches only extensions', () => {
    expect(matchesAccept({ name: '.csv', type: '' }, ['.csv'])).toBe(false)
    expect(matchesAccept({ name: 'a.exe', type: '' }, ['image/*'])).toBe(false)
    expect(matchesAccept({ name: 'a.png', type: '' }, ['image/*'])).toBe(false)
  })
})

describe('validateFile', () => {
  it('accepts a good file synchronously', () => {
    expect(validateFile(file('a.png', 50, 'image/png'), { maxSize: '1 KB', accept: ['image/*'] })).toEqual([])
  })

  it('rejects with a code, a plain message and params for translation', () => {
    const r = validateFile(file('a.png', 5000, 'image/png'), { maxSize: '1 KB', minSize: 10, accept: ['.pdf'] }) as { code: string; message: string; params: Record<string, unknown> }[]

    expect(r.map((x) => x.code)).toEqual(['too-large', 'type'])
    expect(r[0]).toMatchObject({ message: 'The file is 5 KB; the limit is 1 KB.', params: { size: 5000, max: 1000, name: 'a.png' } })
    expect((validateFile(file('a', 1), { minSize: 10 }) as { code: string }[])[0]!.code).toBe('too-small')
  })

  it('answers asynchronously only when a rule has to look inside the file', async () => {
    expect(validateFile(file('a', 1), { accept: ['*/*'] })).toBeInstanceOf(Array)
    const p = validateFile(file('a', 1), { custom: () => 'no' })

    expect(p).toBeInstanceOf(Promise)
    expect(await p).toEqual([{ code: 'custom', message: 'no', params: { name: 'a' } }])
    expect(await validateFile(file('a', 1), { custom: async () => null })).toEqual([])
    expect(await validateFile(file('a', 1), { custom: () => { throw new Error('boom') } })).toMatchObject([{ code: 'custom', message: 'boom' }])
  })

  it('sniff rejects a renamed executable, accepts a real PNG, and cannot judge unknown content', async () => {
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0, 0])], 'cat.png', { type: 'image/png' })
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])], 'cat.png', { type: 'image/png' })
    const text = new File(['hello'], 'cat.png', { type: 'image/png' })
    const rules = { accept: ['image/*'], sniff: true }

    expect(((await validateFile(exe, rules)) as { code: string }[])[0]).toMatchObject({ code: 'type', params: { sniffed: 'application/x-msdownload' } })
    expect(await validateFile(png, rules)).toEqual([])
    expect(await validateFile(text, rules)).toEqual([])
  })

  it('maxFiles is counted across a batch and with existing files', async () => {
    const files = [file('a'), file('b'), file('c')]
    const out = await validateFiles(files, { maxFiles: 2 }, 0)

    expect(out.map((r) => r.map((x) => x.code))).toEqual([[], [], ['too-many']])
    expect((await validateFiles(files, { maxFiles: 2 }, 1)).map((r) => r.length)).toEqual([0, 1, 1])
    expect((await validateFiles([file('a', 500)], { maxFiles: 1, maxSize: 10 }, 0))[0]!.map((x) => x.code)).toEqual(['too-large'])
  })

  it('bad arguments are programmer errors with the fix', () => {
    expect(() => validateFile(null as never, {})).toThrow(/\[Pyreon\] validateFile: expected a File or Blob/)
    expect(() => validateFile(file('a'), null as never)).toThrow(/expected rules/)
    expect(() => validateFile(file('a'), { maxSize: 'huge' })).toThrow(/cannot read the size/)
  })

  it('fuzz: any rules and any file shape give rejections or a [Pyreon] error, never anything else', async () => {
    const r = rng(7)
    const sizes: unknown[] = [0, 1, 1e9, 1e21, '1 KB', '9 GB', NaN, -1, '', 'x', null, undefined, {}, [], '10 mb', 1.5, Infinity]
    const accepts: unknown[] = [undefined, [], ['*/*'], ['image/*', '.png'], ['', ' '], ['image/'], ['.'], [5], 'image/*', null]
    const files: unknown[] = [file('a.png', 10, 'image/png'), file('', 0, ''), new Blob(['x']), new Blob([]), {}, null, 5, 'x', { size: NaN }, { size: 5 }, { name: 5, size: 1, type: 5 }]

    for (let i = 0; i < 2000; i++) {
      const rules = { maxSize: pick(r, sizes), minSize: pick(r, sizes), accept: pick(r, accepts) } as never
      const f = pick(r, files) as never

      try {
        await validateFile(f, rules)
      } catch (e) {
        expect(e instanceof TypeError || e instanceof RangeError, String(e)).toBe(true)
        expect((e as Error).message).toMatch(/^\[Pyreon\] (validateFile|parseSize): /)
      }
    }
  })
})

describe('sniffType', () => {
  const head = (...bytes: number[]): Uint8Array => new Uint8Array([...bytes, ...new Array(16).fill(0)])
  const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

  it('recognises the common types by magic number', () => {
    expect(sniffBytes(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffBytes(head(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffBytes(head(...ascii('GIF89a')))).toBe('image/gif')
    expect(sniffBytes(head(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')))).toBe('image/webp')
    expect(sniffBytes(head(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBe('audio/wav')
    expect(sniffBytes(head(...ascii('%PDF-1.7')))).toBe('application/pdf')
    expect(sniffBytes(head(0x50, 0x4b, 0x03, 0x04))).toBe('application/zip')
    expect(sniffBytes(head(0, 0, 0, 0x18, ...ascii('ftypmp42')))).toBe('video/mp4')
    expect(sniffBytes(head(0, 0, 0, 0x18, ...ascii('ftypavif')))).toBe('image/avif')
    expect(sniffBytes(head(0x4d, 0x5a))).toBe('application/x-msdownload')
    expect(sniffBytes(head(0x7f, 0x45, 0x4c, 0x46))).toBe('application/x-elf')
    expect(sniffBytes(new TextEncoder().encode('  <svg xmlns="x"></svg>'))).toBe('image/svg+xml')
    expect(sniffBytes(new TextEncoder().encode('<?xml version="1.0"?><svg/>'))).toBe('image/svg+xml')
  })

  it('answers null for unknown, empty and text content, and reads only the first bytes of a file', async () => {
    expect(sniffBytes(new Uint8Array([]))).toBeNull()
    expect(sniffBytes(new TextEncoder().encode('hello world'))).toBeNull()
    expect(await sniffType(new Blob([]))).toBeNull()
    let sliced: [number | undefined, number | undefined] | null = null
    const blob = new Blob([new Uint8Array(10_000)])
    const spy = { slice: (a?: number, b?: number) => { sliced = [a, b]; return blob.slice(a, b) } } as unknown as Blob

    await sniffType(spy)
    expect(sliced).toEqual([0, 264])
  })

  it('fuzz: any bytes give a string or null and never throw', () => {
    const r = rng(3)

    for (let i = 0; i < 3000; i++) {
      const bytes = new Uint8Array(int(r, 0, 40)).map(() => int(r, 0, 255))
      const out = sniffBytes(bytes)

      expect(out === null || typeof out === 'string').toBe(true)
    }
  })
})

describe('chunks', () => {
  it('plans parts without reading the file', () => {
    expect(chunkCount(10, 4)).toBe(3)
    expect(chunkCount(0, 4)).toBe(1)
    expect(chunkCount(8, 4)).toBe(2)
    expect([...planChunks(10, 4)]).toEqual([{ index: 0, start: 0, end: 4 }, { index: 1, start: 4, end: 8 }, { index: 2, start: 8, end: 10 }])
    expect(chunkRange(10, 4, 2)).toEqual({ index: 2, start: 8, end: 10 })
    expect([...planChunks(0, 4)]).toEqual([{ index: 0, start: 0, end: 0 }])
  })

  it('property: the parts cover the file exactly once, in order, none empty unless the file is', () => {
    const r = rng(9)

    for (let i = 0; i < 500; i++) {
      const size = int(r, 0, 100_000)
      const chunk = int(r, 1, 5000)
      const parts = [...planChunks(size, chunk)]

      expect(parts.length).toBe(chunkCount(size, chunk))
      expect(parts[0]!.start).toBe(0)
      expect(parts[parts.length - 1]!.end).toBe(size)
      parts.forEach((p, k) => {
        if (k > 0) expect(p.start).toBe(parts[k - 1]!.end)
        expect(p.end - p.start).toBeLessThanOrEqual(chunk)
        if (size > 0) expect(p.end).toBeGreaterThan(p.start)
        expect(chunkRange(size, chunk, k)).toEqual(p)
      })
    }
  })

  it('a huge file is planned lazily and rejects bad input', () => {
    expect(chunkCount(1e12, 5e6)).toBe(200_000)
    expect(planChunks(1e12, 5e6).next().value).toEqual({ index: 0, start: 0, end: 5e6 })
    expect(() => chunkCount(-1, 4)).toThrow(/\[Pyreon\] chunkCount: size/)
    expect(() => chunkCount(10, 0)).toThrow(/chunkSize must be a whole number/)
    expect(() => chunkCount(10, 1.5)).toThrow(/chunkSize/)
    expect(() => chunkRange(10, 4, 3)).toThrow(/outside the 3 parts/)
    expect(suggestChunkSize(1e12)).toBe(1e8)
    expect(suggestChunkSize(10)).toBe(5 * 1024 * 1024)
  })
})

describe('progress math', () => {
  it('clamps, sums by bytes and never goes back', () => {
    expect(progressOf(50, 200)).toEqual({ loaded: 50, total: 200, ratio: 0.25 })
    expect(progressOf(500, 200).loaded).toBe(200)
    expect(progressOf(-5, 200).loaded).toBe(0)
    expect(progressOf(NaN, 200).loaded).toBe(0)
    expect(progressOf(0, 0).ratio).toBe(0)
    expect(progressOf(0, 0, true).ratio).toBe(1)
    expect(sumProgress([progressOf(50, 100), progressOf(0, 100)]).ratio).toBe(0.25)
    expect(sumProgress([]).ratio).toBe(0)
    expect(sumProgress([progressOf(0, 0, true)]).ratio).toBe(1)
    expect(monotonic(70, 30)).toBe(70)
    expect(monotonic(30, 70)).toBe(70)
  })

  it('speed is smoothed, unknown until measurable, and gives a remaining time', () => {
    const m = createSpeedMeter(0.5)

    expect(m.speed()).toBeNull()
    m.record(0, 0)
    m.record(100, 100)
    expect(m.speed()).toBeNull()
    m.record(1000, 1000)
    expect(m.speed()).toBe(1000)
    m.record(1500, 2000)
    expect(m.speed()).toBe(750)
    expect(remainingMs(1500, 3000, 750)).toBe(2000)
    expect(remainingMs(0, 10, null)).toBeNull()
    expect(remainingMs(0, 10, 0)).toBeNull()
    m.reset()
    expect(m.speed()).toBeNull()
  })
})

describe('errors', () => {
  it('retries only what a retry can fix', () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s), String(s)).toBe(true)
    for (const s of [400, 401, 403, 404, 409, 413, 415, 422, 200]) expect(isRetryableStatus(s), String(s)).toBe(false)
  })

  it('Retry-After as seconds and as an HTTP date', () => {
    const now = Date.parse('2026-11-18T10:00:00Z')

    expect(parseRetryAfter('120')).toBe(120_000)
    expect(parseRetryAfter('0')).toBe(0)
    expect(parseRetryAfter('Wed, 18 Nov 2026 10:00:30 GMT', now)).toBe(30_000)
    expect(parseRetryAfter('Wed, 18 Nov 2026 09:00:00 GMT', now)).toBe(0)
    for (const bad of ['', '-5', 'soon', '1.5', null, undefined]) expect(parseRetryAfter(bad as never, now), String(bad)).toBeUndefined()
    expect(parseRetryAfter('99999999')).toBe(86_400_000)
  })

  it('builds typed errors from a status, a thrown value and an abort', () => {
    expect(errorFromStatus(429, { retryAfter: '3', body: { error: 'slow' } })).toEqual({ kind: 'server', message: 'The server answered 429.', status: 429, retryable: true, retryAfter: 3000, body: { error: 'slow' } })
    expect(errorFromStatus(422, { retryAfter: '3', body: { field: 'x' } })).toMatchObject({ retryable: false, body: { field: 'x' } })
    expect(errorFromStatus(422)).not.toHaveProperty('retryAfter')
    expect(toUploadError(new DOMException('x', 'AbortError'))).toMatchObject({ kind: 'aborted', retryable: false })
    expect(toUploadError(new Error('bug'))).toMatchObject({ kind: 'network', retryable: false, message: 'bug' })
    expect(toUploadError({ status: 503 })).toMatchObject({ kind: 'server', retryable: true, status: 503 })
    expect(toUploadError('text')).toMatchObject({ message: 'text' })
    expect(toUploadError(undefined)).toMatchObject({ retryable: false })
    const own = uploadError('network', 'down')

    expect(own.retryable).toBe(true)
    expect(toUploadError(own)).toBe(own)
    expect(isUploadError(own)).toBe(true)
    expect(isUploadError({ kind: 'x', message: 'y', retryable: true })).toBe(false)
    expect(isUploadError(null)).toBe(false)
  })

  it('backoff grows, is capped, and is jittered within its window', () => {
    expect(defaultBackoff(1, () => 0)).toBe(250)
    expect(defaultBackoff(1, () => 1)).toBe(500)
    expect(defaultBackoff(3, () => 1)).toBe(2000)
    expect(defaultBackoff(30, () => 1)).toBe(60_000)
    const r = rng(5)

    for (let i = 0; i < 200; i++) {
      const d = defaultBackoff(int(r, 1, 12), r)

      expect(d).toBeGreaterThanOrEqual(250)
      expect(d).toBeLessThanOrEqual(60_000)
    }
  })
})

describe('collectDropped and collectPasted', () => {
  const item = (f: File | null, entry: unknown = undefined): DataTransferItem => ({ kind: 'file', type: f?.type ?? '', getAsFile: () => f, ...(entry === undefined ? {} : { webkitGetAsEntry: () => entry }) }) as unknown as DataTransferItem
  const dt = (items: DataTransferItem[], files: File[] = []): DataTransfer => ({ items, files, types: ['Files'] }) as unknown as DataTransfer
  const fileEntry = (f: File) => ({ isFile: true, isDirectory: false, name: f.name, file: (ok: (x: File) => void) => ok(f) })
  const dirEntry = (name: string, children: unknown[]) => {
    let served = false

    return { isFile: false, isDirectory: true, name, createReader: () => ({ readEntries: (ok: (e: unknown[]) => void) => { if (served) ok([]); else { served = true; ok(children) } } }) }
  }

  it('takes plain files, and flattens folders in order', async () => {
    const a = file('a')
    const b = file('b')
    const c = file('c')

    expect(await collectDropped(dt([item(a), item(b)]))).toEqual([a, b])
    expect(await collectDropped(dt([], [a]))).toEqual([a])
    expect(await collectDropped(dt([item(null, dirEntry('d', [fileEntry(b), dirEntry('e', [fileEntry(c)])])), item(a, fileEntry(a))]))).toEqual([b, c, a])
    expect(await collectDropped(dt([item(a, dirEntry('d', [fileEntry(b)]))]), { directories: false })).toEqual([a])
    expect(await collectDropped(null)).toEqual([])
  })

  it('reads clipboard files and leaves text alone', () => {
    const img = file('image.png', 4, 'image/png')

    expect(collectPasted(dt([item(img), { kind: 'string', type: 'text/plain' } as unknown as DataTransferItem]))).toEqual([img])
    expect(collectPasted(dt([{ kind: 'string' } as unknown as DataTransferItem]))).toEqual([])
    expect(collectPasted(null)).toEqual([])
  })
})
