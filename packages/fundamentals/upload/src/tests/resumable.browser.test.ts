import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createResumeStore, createUploader, type Transport, type UploadFile } from '../index'
import { chunkedTransport } from '../transport-chunked'
import { s3Transport } from '../transport-s3'
import { tusTransport } from '../transport-tus'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const until = async (cond: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> => {
  const start = Date.now()

  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for a condition')
    await sleep(20)
  }
}

const getJson = async (path: string): Promise<Record<string, any>> => (await fetch(`/__u${path}`)).json()
const bytes = (n: number, name = 'big.bin'): File => new File([Uint8Array.from({ length: n }, (_, i) => i % 251)], name, { type: 'application/octet-stream', lastModified: 1000 })
const settled = (f: UploadFile): boolean => ['done', 'failed', 'cancelled'].includes(f.status())
const MB = 1024 * 1024

/** Wrap a transport to record each call's resume state and which request ran. */
function spy(inner: Transport): { transport: Transport; states: unknown[] } {
  const states: unknown[] = []

  return { states, transport: { upload: (file, ctx) => { states.push(ctx.resumeState); return inner.upload(file, ctx) } } }
}

describe('chunkedTransport against the reference handler', () => {
  it('sends the parts, verifies SHA-256 on the server, joins them and reports the result', async () => {
    const up = createUploader({ transport: chunkedTransport({ url: '/__u/chunked', chunkSize: MB, parallel: 2, checksum: 'sha-256' }) })
    const [f] = up.add([bytes(3 * MB + 5)])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.result()).toEqual({ name: 'big.bin', size: 3 * MB + 5 })
    expect(f!.progress().ratio).toBe(1)
    up.dispose()
  })

  it('a part whose checksum the server rejects is a 422: not retried, the file fails with the server body', async () => {
    const orig = XMLHttpRequest.prototype.setRequestHeader

    XMLHttpRequest.prototype.setRequestHeader = function (this: XMLHttpRequest, k: string, v: string) { orig.call(this, k, k === 'x-part-sha256' ? 'deadbeef' : v) }
    try {
      const up = createUploader({ transport: chunkedTransport({ url: '/__u/chunked', chunkSize: MB, checksum: 'sha-256' }), retry: { backoff: () => 5 } })
      const [f] = up.add([bytes(100)])

      await until(() => settled(f!))
      expect(f!.status()).toBe('failed')
      expect(f!.error()).toMatchObject({ status: 422, retryable: false, body: { error: 'checksum mismatch' } })
      up.dispose()
    } finally {
      XMLHttpRequest.prototype.setRequestHeader = orig
    }
  })

  it('pause then resume continues with the parts the server has, not from zero', async () => {
    const seen: unknown[] = []
    const inner = chunkedTransport({ url: '/__u/chunked', chunkSize: 64 * 1024, parallel: 1 })
    const open = (await getJson('/chunked/state')).open
    const up = createUploader({ transport: { upload: (file, ctx) => { seen.push(ctx.resumeState); return inner.upload(file, ctx) } }, concurrency: 1 })
    const [f] = up.add([bytes(16 * MB)])

    await until(() => f!.progress().loaded >= MB)
    up.pause(f!.id)
    const held = f!.progress().loaded

    expect(f!.status()).toBe('paused')
    up.resume(f!.id)
    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.attempt()).toBe(2)
    expect(held).toBeGreaterThanOrEqual(MB)
    expect(seen[0]).toBeUndefined()
    expect((seen[1] as { done: number[] }).done.length).toBeGreaterThan(10)
    expect((await getJson('/chunked/state')).open).toBe(open)
    up.dispose()
  })

  it('continues after a page reload: a new uploader with the same persisted state skips the finished parts', async () => {
    const storage = new Map<string, string>()
    const store = createResumeStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) })
    const file = bytes(16 * MB, 'movie.bin')
    const first = spy(chunkedTransport({ url: '/__u/chunked', chunkSize: 64 * 1024, parallel: 1 }))
    const up1 = createUploader({ transport: first.transport, concurrency: 1, resume: store })
    const [a] = up1.add([file])

    await until(() => a!.progress().loaded >= MB)
    up1.dispose()
    expect([...storage.keys()].length).toBe(1)
    const saved = JSON.parse([...storage.values()][0]!) as { state: { done: number[]; uploadId: string } }

    expect(saved.state.done.length).toBeGreaterThanOrEqual(1)
    const second = spy(chunkedTransport({ url: '/__u/chunked', chunkSize: 64 * 1024, parallel: 1 }))
    const putsBefore = (await getJson('/chunked/state')).puts
    const up2 = createUploader({ transport: second.transport, resume: store })
    const [b] = up2.add([file])

    await until(() => settled(b!))
    expect(b!.status()).toBe('done')
    expect(second.states[0]).toMatchObject({ uploadId: saved.state.uploadId })
    // 16 MB in 64 KB parts is 256 parts; the parts the server already had were not sent again.
    expect((await getJson('/chunked/state')).puts - putsBefore).toBeLessThan(256 - saved.state.done.length + 1)
    expect(b!.result()).toEqual({ name: 'movie.bin', size: 16 * MB })
    expect(storage.size).toBe(0)
    up2.dispose()
  })

  it('a saved state for an upload the server forgot starts over', async () => {
    const storage = new Map<string, string>()
    const store = createResumeStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) })
    const file = bytes(2 * MB, 'forgot.bin')

    store.save({ name: file.name, size: file.size, type: file.type, file }, { uploadId: 'does-not-exist', chunkSize: MB, done: [0] })
    const up = createUploader({ transport: chunkedTransport({ url: '/__u/chunked', chunkSize: MB }), resume: store })
    const [f] = up.add([file])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.result()).toEqual({ name: 'forgot.bin', size: 2 * MB })
    up.dispose()
  })

  it('trusts the server\'s list of parts over the saved state: parts it does not have are sent again', async () => {
    const file = bytes(4 * MB, 'liar.bin')
    const created = await (await fetch('/__u/chunked', { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size, chunkSize: MB }) })).json() as { uploadId: string }
    const lying = { load: () => ({ uploadId: created.uploadId, chunkSize: MB, done: [0, 1, 2, 3] }), save: () => {}, clear: () => {} }
    const up = createUploader({ transport: chunkedTransport({ url: '/__u/chunked', chunkSize: MB }), resume: lying })
    const [f] = up.add([file])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.result()).toEqual({ name: 'liar.bin', size: 4 * MB })
    up.dispose()
  })

  it('cancel tells the server to forget the upload', async () => {
    const open = (await getJson('/chunked/state')).open
    const up = createUploader({ transport: chunkedTransport({ url: '/__u/chunked', chunkSize: 64 * 1024, parallel: 1 }), concurrency: 1 })
    const [f] = up.add([bytes(40 * MB)])

    await until(async () => f!.progress().loaded > 0 && (await getJson('/chunked/state')).open === open + 1)
    up.cancel(f!.id)
    await until(async () => (await getJson('/chunked/state')).open === open)
    up.dispose()
  })
})

describe('s3Transport against a server that mimics the S3 contract', () => {
  const endpoint = (path: string): string => `/__u/s3${path}`
  const post = async (path: string, body?: unknown): Promise<any> => (await fetch(endpoint(path), { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).json()
  const options = (extra: Partial<Parameters<typeof s3Transport>[0]> = {}): Parameters<typeof s3Transport>[0] => ({
    presign: async (f) => post(`/sign-single?key=${encodeURIComponent(f.name)}`),
    multipart: {
      create: async (f) => post(`/create?key=${encodeURIComponent(f.name)}`),
      signPart: async (_f, p) => post(`/sign?uploadId=${p.uploadId}&partNumber=${p.partNumber}`),
      complete: async (_f, c) => post(`/complete?uploadId=${c.uploadId}`, { parts: c.parts }),
      abort: async (_f, u) => void (await fetch(endpoint(`/abort?uploadId=${u.uploadId}`), { method: 'DELETE' })),
      list: async (_f, u) => (await fetch(endpoint(`/list?uploadId=${u.uploadId}`))).json(),
    },
    ...extra,
  })

  beforeEach(async () => {
    await fetch(endpoint('/state'))
  })

  it('a small file is one presigned PUT', async () => {
    const before = (await getJson('/s3/state')).puts
    const up = createUploader({ transport: s3Transport(options()) })
    const [f] = up.add([bytes(1000, 'small.bin')])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.result()).toMatchObject({ size: 1000 })
    expect((await getJson('/s3/state')).puts).toBe(before + 1)
    up.dispose()
  })

  it('a big file is a multipart upload: presigned parts with progress, ETags collected, completed in order', async () => {
    const up = createUploader({ transport: s3Transport(options({ partSize: 5 * MB, parallel: 2 })) })
    const [f] = up.add([bytes(11 * MB, 'multi.bin')])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.result()).toMatchObject({ size: 11 * MB, parts: 3 })
    expect((await getJson('/s3/state')).open).toBe(0)
    up.dispose()
  })

  it('a bad signature is a 403: not retried, the file fails', async () => {
    const up = createUploader({ transport: s3Transport({ presign: async () => ({ url: '/__u/s3/obj?key=x&sig=bad' }) }), retry: { backoff: () => 5 } })
    const [f] = up.add([bytes(100)])

    await until(() => settled(f!))
    expect(f!.status()).toBe('failed')
    expect(f!.error()).toMatchObject({ status: 403, retryable: false })
    up.dispose()
  })

  it('resumes a multipart upload after a reload: it asks ListParts and sends only the missing parts', async () => {
    const storage = new Map<string, string>()
    const store = createResumeStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) })
    const file = bytes(16 * MB, 'resume.bin')
    const up1 = createUploader({ transport: s3Transport(options({ partSize: 5 * MB, parallel: 1 })), concurrency: 1, resume: store })
    const [a] = up1.add([file])

    await until(() => a!.progress().loaded >= 5 * MB)
    up1.dispose()
    // Wait until the server has dealt with the part request the dispose cut off, instead of guessing how long that takes.
    await until(async () => (await getJson('/s3/state')).inflight === 0)
    const putsBefore = (await getJson('/s3/state')).puts
    const up2 = createUploader({ transport: s3Transport(options({ partSize: 5 * MB, parallel: 1 })), resume: store })
    const [b] = up2.add([file])

    await until(() => settled(b!))
    expect(b!.status()).toBe('done')
    expect(b!.result()).toMatchObject({ size: 16 * MB, parts: 4 })
    expect((await getJson('/s3/state')).puts - putsBefore).toBeLessThanOrEqual(3)
    up2.dispose()
  })

  it('trusts ListParts over the saved state: a part the server no longer has is sent again', async () => {
    const file = bytes(11 * MB, 'forgot-part.bin')
    const storage = new Map<string, string>()
    const store = createResumeStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) })
    const up1 = createUploader({ transport: s3Transport(options({ partSize: 5 * MB, parallel: 1 })), concurrency: 1, resume: store })
    const [a] = up1.add([file])

    await until(() => a!.progress().loaded >= 5 * MB)
    up1.dispose()
    await until(async () => (await getJson('/s3/state')).inflight === 0)
    const lost = options({ partSize: 5 * MB, parallel: 1 })

    lost.multipart!.list = async () => []
    const putsBefore = (await getJson('/s3/state')).puts
    const up2 = createUploader({ transport: s3Transport(lost), resume: store })
    const [b] = up2.add([file])

    await until(() => settled(b!))
    expect(b!.status()).toBe('done')
    expect((await getJson('/s3/state')).puts - putsBefore).toBeGreaterThanOrEqual(3)
    up2.dispose()
  })

  it('cancel aborts the multipart upload on the server', async () => {
    const aborts = (await getJson('/s3/state')).aborts
    const up = createUploader({ transport: s3Transport(options({ partSize: 5 * MB, parallel: 1 })), concurrency: 1 })
    const [f] = up.add([bytes(30 * MB, 'abort.bin')])

    await until(async () => f!.progress().loaded > 0 && (await getJson('/s3/state')).open >= 1)
    up.cancel(f!.id)
    await until(async () => (await getJson('/s3/state')).aborts === aborts + 1)
    up.dispose()
  })
})

describe('tusTransport against a minimal tus 1.0 server', () => {
  const tus = (extra: Partial<Parameters<typeof tusTransport>[0]> = {}): Transport => tusTransport({ endpoint: '/__u/tus', chunkSize: MB, ...extra })

  it('creates the upload with its length and metadata, then PATCHes at the right offsets', async () => {
    const up = createUploader({ transport: tus() })
    const [f] = up.add([bytes(2 * MB + 7, 'tus.bin')])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    const state = await getJson('/tus/state')
    const mine = state.uploads.find((u: any) => u.length === 2 * MB + 7)

    expect(mine.offset).toBe(2 * MB + 7)
    expect(atob(mine.metadata.split(',').find((m: string) => m.startsWith('filename'))!.split(' ')[1]!)).toBe('tus.bin')
    up.dispose()
  })

  it('an empty file is created and done without a PATCH', async () => {
    const up = createUploader({ transport: tus() })
    const [f] = up.add([new File([], 'empty.bin')])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    up.dispose()
  })

  it('resumes after a reload with HEAD and continues from the server offset', async () => {
    const storage = new Map<string, string>()
    const store = createResumeStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) })
    const file = bytes(16 * MB, 'tus-resume.bin')
    const up1 = createUploader({ transport: tus({ chunkSize: 64 * 1024 }), concurrency: 1, resume: store })
    const [a] = up1.add([file])

    await until(() => a!.progress().loaded >= MB)
    up1.dispose()
    await until(async () => (await getJson('/tus/state')).inflight === 0)
    const log = (await getJson('/tus/state')).requests.length
    const up2 = createUploader({ transport: tus({ chunkSize: 64 * 1024 }), resume: store })
    const [b] = up2.add([file])

    await until(() => settled(b!))
    expect(b!.status()).toBe('done')
    const after = (await getJson('/tus/state')).requests.slice(log)

    expect(after[0]).toMatch(/^HEAD \/files\//)
    expect(after.filter((r: string) => r.startsWith('POST')).length).toBe(0)
    up2.dispose()
  })

  it('a saved URL the server forgot (404) starts a new upload', async () => {
    const file = bytes(MB, 'gone.bin')
    const up = createUploader({ transport: tus(), resume: { load: () => ({ url: '/__u/tus/files/nope' }), save: () => {}, clear: () => {} } })
    const [f] = up.add([file])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    up.dispose()
  })

  it('cancel terminates the upload (DELETE)', async () => {
    const up = createUploader({ transport: tus({ chunkSize: 256 * 1024 }), concurrency: 1 })
    const [f] = up.add([bytes(40 * MB, 'cancel.bin')])
    const open = (await getJson('/tus/state')).open

    await until(async () => f!.progress().loaded > 0)
    up.cancel(f!.id)
    await until(async () => (await getJson('/tus/state')).requests.some((r: string) => r.startsWith('DELETE')))
    expect((await getJson('/tus/state')).open).toBeLessThanOrEqual(open)
    up.dispose()
  })
})

afterEach(async () => {
  await sleep(50)
})
