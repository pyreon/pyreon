import { describe, expect, it } from 'vitest'
import { createUploader, type Transport, type UploadFile } from '../index'
import { chunkedTransport } from '../transport-chunked'
import { s3Transport } from '../transport-s3'
import { tusTransport } from '../transport-tus'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const settled = (f: UploadFile): boolean => ['done', 'failed', 'cancelled'].includes(f.status())

const until = async (cond: () => boolean, ms = 15_000): Promise<void> => {
  const start = Date.now()

  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for a condition')
    await sleep(20)
  }
}

const file = (n: number, name = 'e.bin'): File => new File([new Uint8Array(n)], name, { type: 'application/octet-stream', lastModified: 5 })

const run = async (transport: Transport, f: File, resume?: unknown): Promise<UploadFile> => {
  const up = createUploader({ transport, retry: { backoff: () => 5, attempts: 2 }, ...(resume === undefined ? {} : { resume: { load: () => resume, save: () => {}, clear: () => {} } }) })
  const [u] = up.add([f])

  await until(() => settled(u!))
  up.dispose()

  return u!
}

describe('chunked: edge inputs', () => {
  const chunked = (extra: object = {}): Transport => chunkedTransport({ url: '/__u/chunked', chunkSize: 1024, ...extra })

  it('a zero-byte file is one empty part and completes', async () => {
    const u = await run(chunked(), file(0))

    expect(u.status()).toBe('done')
    expect(u.result()).toEqual({ name: 'e.bin', size: 0 })
  })

  it('a size that is not a multiple of the part size', async () => {
    const u = await run(chunked(), file(2049))

    expect(u.result()).toEqual({ name: 'e.bin', size: 2049 })
  })

  it('garbage resume state of every shape starts fresh', async () => {
    for (const bad of [null, 'x', 42, [], {}, { uploadId: 5 }, { uploadId: 'a', chunkSize: 'x', done: [] }, { uploadId: 'a', chunkSize: 10, done: 'x' }]) {
      expect((await run(chunked(), file(100), bad)).status(), JSON.stringify(bad)).toBe('done')
    }
  })

  it('a server that answers no uploadId is a non-retryable error that says so', async () => {
    const u = await run(chunkedTransport({ url: '/__u/status?code=200&x=1', chunkSize: 1024 }), file(10))

    expect(u.status()).toBe('failed')
    expect(u.error()).toMatchObject({ retryable: false })
    expect(u.error()!.message).toContain('uploadId')
  })

  it('a 5xx on the first request is retried by the queue; a 404 base is not', async () => {
    const flaky = await run(chunkedTransport({ url: '/__u/status?code=503', chunkSize: 1024 }), file(10))

    expect(flaky.attempt()).toBe(2)
    expect((await run(chunkedTransport({ url: '/__u/chunked/nope', chunkSize: 1024 }), file(10))).error()).toMatchObject({ status: 404, retryable: false })
  })

  it('bad options are [Pyreon] errors', () => {
    expect(() => chunkedTransport({} as never)).toThrow(/\[Pyreon\] chunkedTransport: expected \{ url/)
    expect(() => chunkedTransport({ url: '/x', chunkSize: 0 })).toThrow(/chunkSize must be a whole number/)
    expect(() => chunkedTransport({ url: '/x', parallel: 0 })).toThrow(/parallel must be a whole number/)
    expect(() => chunkedTransport({ url: '/x', chunkSize: 1.5 })).toThrow(/chunkSize/)
  })
})

describe('s3: edge inputs', () => {
  const noEtag: Transport = s3Transport({
    presign: async () => ({ url: '/__u/s3/obj?key=x&sig=ok' }),
    multipart: {
      create: async () => ({ uploadId: 'noetag' }),
      signPart: async () => ({ url: '/__u/noetag' }),
      complete: async () => 'never',
    },
    partSize: 5 * 1024 * 1024,
  })

  it('a part response with no ETag is a clear, non-retryable error that names the CORS fix', async () => {
    const u = await run(noEtag, file(6 * 1024 * 1024))

    expect(u.status()).toBe('failed')
    expect(u.error()!.message).toContain('ExposeHeaders')
    expect(u.error()!.retryable).toBe(false)
  })

  it('a zero-byte file is a single presigned PUT', async () => {
    const u = await run(s3Transport({ presign: async () => ({ url: '/__u/s3/obj?key=zero&sig=ok' }) }), file(0))

    expect(u.status()).toBe('done')
  })

  it('a partSize below the S3 minimum is raised, and a presign that throws fails the file without a retry', async () => {
    const sizes: number[] = []
    const t = s3Transport({
      presign: async () => ({ url: '/__u/s3/obj?key=x&sig=ok' }),
      multipart: {
        create: async () => ({ uploadId: 'small' }),
        signPart: async (_f, p) => { sizes.push(p.partNumber); return { url: '/__u/s3/obj?uploadId=none&partNumber=1&sig=ok' } },
        complete: async () => 'x',
      },
      partSize: 1024,
    })

    await run(t, file(6 * 1024 * 1024))
    expect(sizes[0]).toBe(1)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2)
    const boom = await run(s3Transport({ presign: async () => { throw new Error('signing service down') } }), file(10))

    expect(boom.status()).toBe('failed')
    expect(boom.error()).toMatchObject({ message: 'signing service down', retryable: false })
  })

  it('bad options are [Pyreon] errors', () => {
    expect(() => s3Transport({} as never)).toThrow(/\[Pyreon\] s3Transport: expected \{ presign/)
    expect(() => s3Transport({ presign: async () => ({ url: '' }), parallel: 0 })).toThrow(/parallel/)
    expect(() => s3Transport({ presign: async () => ({ url: '' }), partSize: -1 })).toThrow(/partSize/)
  })
})

describe('tus: edge inputs', () => {
  const tus = (extra: object = {}): Transport => tusTransport({ endpoint: '/__u/tus', chunkSize: 1024, ...extra })

  it('chunkSize Infinity sends the whole file in one PATCH; an uneven size ends exactly', async () => {
    expect((await run(tus({ chunkSize: Infinity }), file(5000))).status()).toBe('done')
    expect((await run(tus(), file(2049))).status()).toBe('done')
  })

  it('a saved URL whose upload has a different length starts a new upload', async () => {
    const make = await fetch('/__u/tus', { method: 'POST', headers: { 'tus-resumable': '1.0.0', 'upload-length': '7' } })
    const stale = { url: make.headers.get('location')! }
    const u = await run(tus(), file(3000), stale)

    expect(u.status()).toBe('done')
    expect((u.result() as { url: string }).url).not.toBe(new URL(stale.url, location.href).href)
  })

  it('garbage resume state starts fresh', async () => {
    for (const bad of [null, 'x', 5, {}, { url: 5 }]) expect((await run(tus(), file(10), bad)).status(), JSON.stringify(bad)).toBe('done')
  })

  it('a server without tus (412) is a non-retryable error; a creation with no Location is named', async () => {
    const u = await run(tusTransport({ endpoint: '/__u/status?code=412' }), file(10))

    expect(u.status()).toBe('failed')
    expect(u.error()).toMatchObject({ status: 412, retryable: false })
    const noLocation = await run(tusTransport({ endpoint: '/__u/status?code=201' }), file(10))

    expect(noLocation.error()!.message).toContain('Location')
  })

  it('bad options are [Pyreon] errors', () => {
    expect(() => tusTransport({} as never)).toThrow(/\[Pyreon\] tusTransport: expected \{ endpoint/)
    expect(() => tusTransport({ endpoint: '/x', chunkSize: 0 })).toThrow(/chunkSize/)
    expect(() => tusTransport({ endpoint: '/x', chunkSize: 1.5 })).toThrow(/chunkSize/)
  })
})
