// The resume store, on an in-memory Storage, and how the queue loads, saves and clears it. Fake transports (`helpers.ts`)
// stand in for the network; the persisted resume of real transports is `resumable.browser.test.ts` in Chromium.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResumeStore, createUploader, fingerprint } from '../index'
import { uploadError } from '../errors'
import { fakeTransport, flush } from './helpers'

afterEach(() => {
  vi.useRealTimers()
})

function memoryStorage() {
  const map = new Map<string, string>()

  return { map, getItem: vi.fn((k: string) => map.get(k) ?? null), setItem: vi.fn((k: string, v: string) => void map.set(k, v)), removeItem: vi.fn((k: string) => void map.delete(k)) }
}

const fileOf = (name = 'v.mp4', lastModified = 5): File => new File([new Uint8Array(10)], name, { type: 'video/mp4', lastModified })
const entry = (f: File) => ({ name: f.name, size: f.size, type: f.type, file: f })

describe('fingerprint', () => {
  it('is name, size, type and last-modified time; a Blob has no time', () => {
    expect(fingerprint(entry(fileOf()))).toBe('v.mp4|10|video/mp4|5')
    expect(fingerprint({ name: '', size: 1, type: '', file: new Blob(['a']) })).toBe('|1||')
  })
})

describe('createResumeStore', () => {
  it('saves with the time and loads the state back under the prefixed fingerprint; clear removes it', () => {
    const s = memoryStorage()
    const store = createResumeStore(s, { prefix: 'p:', now: () => 1000 })
    const f = entry(fileOf())

    store.save(f, { uploadId: 'a', done: [0] })
    expect([...s.map.keys()]).toEqual(['p:v.mp4|10|video/mp4|5'])
    expect(JSON.parse(s.map.get('p:v.mp4|10|video/mp4|5')!)).toEqual({ at: 1000, state: { uploadId: 'a', done: [0] } })
    expect(store.load(f)).toEqual({ uploadId: 'a', done: [0] })
    expect(store.load(entry(fileOf('other.mp4')))).toBeUndefined()
    store.clear(f)
    expect(s.map.size).toBe(0)
  })

  it('the default prefix is pyreon-upload:', () => {
    const s = memoryStorage()

    createResumeStore(s).save(entry(fileOf()), 1)
    expect([...s.map.keys()][0]).toMatch(/^pyreon-upload:/)
  })

  it('an entry older than maxAge (default seven days) is removed, not loaded', () => {
    const s = memoryStorage()
    let now = 0
    const store = createResumeStore(s, { now: () => now })
    const f = entry(fileOf())

    store.save(f, 'x')
    now = 7 * 24 * 3600 * 1000
    expect(store.load(f)).toBe('x')
    now += 1
    expect(store.load(f)).toBeUndefined()
    expect(s.map.size).toBe(0)
    const short = createResumeStore(s, { maxAge: 10, now: () => now })

    short.save(f, 'y')
    now += 11
    expect(short.load(f)).toBeUndefined()
  })

  it('a corrupt entry (not JSON, no time, no state) is removed', () => {
    const s = memoryStorage()
    const store = createResumeStore(s, { prefix: '' })
    const f = entry(fileOf())
    const key = fingerprint(f)

    for (const bad of ['{not json', '{"state":1}', '{"at":"x","state":1}', '{"at":1}', 'null']) {
      s.map.set(key, bad)
      expect(store.load(f), bad).toBeUndefined()
      expect(s.map.has(key), bad).toBe(false)
    }
  })

  it('a storage that throws (private mode, quota) makes every operation a quiet no-op', () => {
    const boom = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    const store = createResumeStore({ getItem: boom, setItem: boom, removeItem: boom })
    const f = entry(fileOf())

    expect(() => store.save(f, 1)).not.toThrow()
    expect(store.load(f)).toBeUndefined()
    expect(() => store.clear(f)).not.toThrow()
  })
})

describe('the queue and its resume store', () => {
  it('loads the saved state when the file is added, passes it to the first attempt, saves new states and clears when done', async () => {
    const s = memoryStorage()
    const store = createResumeStore(s)
    const f = fileOf()

    store.save(entry(f), { from: 'before' })
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, resume: store })
    const [u] = up.add([f])

    await flush()
    expect(t.calls[0]!.ctx.resumeState).toEqual({ from: 'before' })
    t.calls[0]!.ctx.saveResumeState({ from: 'now' })
    expect(store.load(entry(f))).toEqual({ from: 'now' })
    t.calls[0]!.resolve('ok')
    await flush()
    expect(u!.status()).toBe('done')
    expect(s.map.size).toBe(0)
    up.dispose()
  })

  it('a retryable failure keeps the state for the retry; a final failure clears it', async () => {
    vi.useFakeTimers()
    const s = memoryStorage()
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, resume: createResumeStore(s), retry: { attempts: 3, backoff: () => 10 } })

    up.add([fileOf()])
    await vi.advanceTimersByTimeAsync(0)
    t.calls[0]!.ctx.saveResumeState({ part: 1 })
    t.calls[0]!.reject(uploadError('network', 'down'))
    await vi.advanceTimersByTimeAsync(10)
    expect(s.map.size).toBe(1)
    expect(t.calls[1]!.ctx.resumeState).toEqual({ part: 1 })
    t.calls[1]!.reject(uploadError('server', 'no', { status: 400 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(s.map.size).toBe(0)
    up.dispose()
  })

  it('cancel and remove clear the state; dispose keeps it for the next page', async () => {
    const s = memoryStorage()
    const store = createResumeStore(s)
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, resume: store })
    const [a, b, c] = up.add([fileOf('a'), fileOf('b'), fileOf('c')])

    await flush()
    for (const call of t.calls) call.ctx.saveResumeState({ for: call.file.name })
    expect(s.map.size).toBe(3)
    up.cancel(a!.id)
    up.remove(b!.id)
    expect([...s.map.keys()].map((k) => k.split('|')[0])).toEqual(['pyreon-upload:c'])
    up.dispose()
    expect(s.map.size).toBe(1)
    expect(c!.status()).toBe('cancelled')
  })

  it('a resume store whose load throws is treated as having nothing saved', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, resume: { load: () => { throw new Error('broken') }, save: () => {}, clear: () => {} } })

    up.add([fileOf()])
    await flush()
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]!.ctx.resumeState).toBeUndefined()
    up.dispose()
  })

  it('a retry after cancel starts from nothing, not from the cleared state', async () => {
    const s = memoryStorage()
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, resume: createResumeStore(s) })
    const [a] = up.add([fileOf()])

    await flush()
    t.calls[0]!.ctx.saveResumeState({ part: 3 })
    up.cancel(a!.id)
    up.retry(a!.id)
    await flush()
    expect(t.calls[1]!.ctx.resumeState).toBeUndefined()
    up.dispose()
  })
})
