import { effect } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader, uploadError, useUploader } from '../index'
import { fakeTransport, file, flush } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('adding and validating', () => {
  it('adds files as queued items with plain data and signals, and starts them', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, meta: (f) => ({ owner: f.name }) })
    const [a] = up.add([file('a.txt', 10)])

    expect(a).toMatchObject({ name: 'a.txt', size: 10, type: 'text/plain', meta: { owner: 'a.txt' } })
    expect(a!.status()).toBe('uploading')
    expect(up.files()).toHaveLength(1)
    expect(up.status()).toBe('uploading')
    expect(up.isUploading()).toBe(true)
    expect(Object.isFrozen(a!.meta)).toBe(true)
    t.calls[0]!.resolve({ url: '/x' })
    await flush()
    expect(a!.status()).toBe('done')
    expect(a!.result()).toEqual({ url: '/x' })
    expect(a!.progress()).toEqual({ loaded: 10, total: 10, ratio: 1 })
    expect(up.status()).toBe('done')
    up.dispose()
  })

  it('rejected files stay in the list with their reasons, and never reach the transport', () => {
    const t = fakeTransport()
    const rejected: string[] = []
    const up = createUploader({ transport: t.transport, rules: { maxSize: 50, accept: ['text/*'] }, onReject: (f, r) => rejected.push(`${f.name}:${r.map((x) => x.code)}`) })
    const [big, bad, ok] = up.add([file('big.txt', 500), file('x.png', 5, 'image/png'), file('ok.txt', 5)])

    expect(big!.status()).toBe('rejected')
    expect(big!.rejections()[0]!.code).toBe('too-large')
    expect(big!.error()).toMatchObject({ kind: 'rejected', retryable: false })
    expect(bad!.rejections()[0]!.code).toBe('type')
    expect(ok!.status()).toBe('uploading')
    expect(t.calls).toHaveLength(1)
    expect(rejected).toEqual(['big.txt:too-large', 'x.png:type'])
    expect(up.files()).toHaveLength(3)
    up.dispose()
  })

  it('keepRejected false drops them from the list but still reports them', () => {
    const up = createUploader({ transport: fakeTransport().transport, rules: { maxSize: 5 }, keepRejected: false })
    const [a] = up.add([file('a', 50)])

    expect(a!.status()).toBe('rejected')
    expect(up.files()).toHaveLength(0)
    up.dispose()
  })

  it('maxFiles counts the files already in the list, duplicates can be refused', () => {
    const up = createUploader({ transport: fakeTransport().transport, rules: { maxFiles: 2 }, dedupe: true, autoStart: false })
    const first = up.add([file('a'), file('b'), file('c')])

    expect(first.map((f) => f.status())).toEqual(['queued', 'queued', 'rejected'])
    expect(first[2]!.rejections()[0]!.code).toBe('too-many')
    up.remove(first[0]!.id)
    expect(up.add([file('d')])[0]!.status()).toBe('queued')
    const dup = createUploader({ transport: fakeTransport().transport, dedupe: true, autoStart: false })

    dup.add([file('a')])
    expect(dup.add([file('a')])[0]!.rejections()[0]!.code).toBe('duplicate')
    expect(dup.add([file('a', 101)])[0]!.status()).toBe('queued')
    up.dispose()
    dup.dispose()
  })

  it('an async rule shows validating, then queued or rejected; removing meanwhile is safe', async () => {
    const t = fakeTransport()
    let release!: (m: string | null) => void
    const up = createUploader({ transport: t.transport, rules: { custom: () => new Promise((r) => { release = r }) } })
    const [a] = up.add([file('a')])

    expect(a!.status()).toBe('validating')
    expect(up.status()).toBe('uploading')
    await flush()
    release(null)
    await flush()
    expect(a!.status()).toBe('uploading')
    const [b] = up.add([file('b')])

    await flush()
    up.remove(b!.id)
    release('no')
    await flush()
    expect(up.files().map((f) => f.name)).toEqual(['a'])
    expect(b!.status()).toBe('validating')
    up.dispose()
  })

  it('a rule that throws becomes a rejection, a bad input a [Pyreon] error', async () => {
    const up = createUploader({ transport: fakeTransport().transport, rules: { image: { maxWidth: 10 } } })
    const [a] = up.add([file('a.png', 5, 'image/png')])

    await flush()
    expect(a!.status()).toBe('rejected')
    expect(() => up.add(5 as never)).toThrow(/\[Pyreon\] uploader.add: expected a FileList/)
    expect(() => createUploader({} as never)).toThrow(/expected options with a transport/)
    expect(() => createUploader({ transport: fakeTransport().transport, concurrency: 0 })).toThrow(/concurrency must be a whole number from 1/)
    expect(() => createUploader({ transport: fakeTransport().transport, concurrency: 1.5 })).toThrow(/concurrency/)
    expect(() => createUploader({ transport: fakeTransport().transport, concurrency: NaN })).toThrow(/concurrency/)
    up.dispose()
  })

  it('autoStart false waits for start()', () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, autoStart: false })
    const [a, b] = up.add([file('a'), file('b')])

    expect(t.calls).toHaveLength(0)
    expect(a!.status()).toBe('queued')
    up.start(a!.id)
    expect(t.calls).toHaveLength(1)
    expect(b!.status()).toBe('queued')
    up.start()
    expect(t.calls).toHaveLength(2)
    up.dispose()
  })
})

describe('concurrency and fairness', () => {
  it('never runs more than the limit at once, and takes files in the order they were added', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 2 })

    up.add(Array.from({ length: 6 }, (_, i) => file(`f${i}`)))
    expect(t.running()).toBe(2)
    expect(t.calls.map((c) => c.file.name)).toEqual(['f0', 'f1'])
    for (let step = 0; step < 6; step++) {
      expect(t.running()).toBeLessThanOrEqual(2)
      const live = t.calls.find((c) => !c.settled)!

      live.resolve()
      await flush()
    }
    expect(t.calls.map((c) => c.file.name)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5'])
    expect(up.status()).toBe('done')
    up.dispose()
  })

  it('a file that keeps failing goes to the back of the line instead of starving the others', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 1, retry: { attempts: 3, backoff: () => 10 } })

    up.add([file('flaky'), file('b'), file('c')])
    t.calls[0]!.reject(uploadError('network', 'down'))
    await flush()
    expect(t.calls.map((c) => c.file.name)).toEqual(['flaky', 'b'])
    t.calls[1]!.resolve()
    await flush()
    t.calls[2]!.resolve()
    await flush()
    await vi.advanceTimersByTimeAsync(10)
    expect(t.calls.map((c) => c.file.name)).toEqual(['flaky', 'b', 'c', 'flaky'])
    up.dispose()
  })
})

describe('retry', () => {
  it('retries a network error after the backoff and stops after the attempts', async () => {
    const t = fakeTransport()
    const errors: string[] = []
    const up = createUploader({ transport: t.transport, retry: { attempts: 3, backoff: (n) => n * 100 }, onError: (_f, e) => errors.push(e.kind) })
    const [a] = up.add([file('a')])

    t.calls[0]!.reject(uploadError('network', 'down'))
    await flush()
    expect(a!.status()).toBe('queued')
    expect(a!.error()?.kind).toBe('network')
    expect(a!.attempt()).toBe(1)
    await vi.advanceTimersByTimeAsync(99)
    expect(t.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.calls).toHaveLength(2)
    expect(a!.status()).toBe('uploading')
    t.calls[1]!.reject(uploadError('timeout', 'slow'))
    await flush()
    await vi.advanceTimersByTimeAsync(200)
    expect(t.calls).toHaveLength(3)
    t.calls[2]!.reject(uploadError('network', 'down'))
    await flush()
    expect(a!.status()).toBe('failed')
    expect(errors).toEqual(['network'])
    expect(up.status()).toBe('failed')
    up.dispose()
  })

  it('never retries a 4xx (a validation error), an unknown error or an aborted upload', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: { attempts: 5, backoff: () => 1 } })
    const [a, b, c] = up.add([file('a'), file('b'), file('c')])

    t.calls[0]!.reject(uploadError('server', 'bad', { status: 422, retryable: false, body: { field: 'x' } }))
    t.calls[1]!.reject(new Error('bug'))
    t.calls[2]!.reject(new DOMException('x', 'AbortError'))
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(t.calls).toHaveLength(3)
    expect([a, b, c].map((f) => f!.status())).toEqual(['failed', 'failed', 'failed'])
    expect(a!.error()).toMatchObject({ status: 422, body: { field: 'x' } })
    up.dispose()
  })

  it('honours Retry-After when it is longer than the backoff', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: { backoff: () => 100 } })

    up.add([file('a')])
    t.calls[0]!.reject(uploadError('server', 'busy', { status: 429, retryable: true, retryAfter: 5000 }))
    await flush()
    await vi.advanceTimersByTimeAsync(4999)
    expect(t.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.calls).toHaveLength(2)
    up.dispose()
  })

  it('retry false never retries; a manual retry starts over; transport that throws synchronously fails the file', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: false })
    const [a] = up.add([file('a')])

    t.calls[0]!.reject(uploadError('network', 'down'))
    await flush()
    expect(a!.status()).toBe('failed')
    up.retry(a!.id)
    expect(a!.status()).toBe('uploading')
    expect(a!.attempt()).toBe(1)
    up.dispose()
    const boom = createUploader({ transport: { upload: () => { throw new Error('sync boom') } } })
    const [b] = boom.add([file('b')])

    await flush()
    expect(b!.status()).toBe('failed')
    expect(b!.error()).toMatchObject({ message: 'sync boom', retryable: false })
    boom.dispose()
  })

  it('progress never goes back across a retry: it holds until the new attempt passes it', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: { backoff: () => 1 } })
    const [a] = up.add([file('a', 100)])
    const seen: number[] = []
    const stop = effect(() => { seen.push(a!.progress().loaded) })

    t.calls[0]!.ctx.onProgress(60)
    await vi.advanceTimersByTimeAsync(100)
    t.calls[0]!.reject(uploadError('network', 'down'))
    await flush()
    await vi.advanceTimersByTimeAsync(2)
    t.calls[1]!.ctx.onProgress(10)
    await vi.advanceTimersByTimeAsync(100)
    expect(a!.progress().loaded).toBe(60)
    t.calls[1]!.ctx.onProgress(80)
    await vi.advanceTimersByTimeAsync(100)
    expect(a!.progress().loaded).toBe(80)
    t.calls[1]!.ctx.onProgress(70)
    await vi.advanceTimersByTimeAsync(100)
    t.calls[1]!.resolve()
    await flush()
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    expect(seen[seen.length - 1]).toBe(100)
    stop.dispose()
    up.dispose()
  })
})

describe('progress', () => {
  it('coalesces 10,000 progress events into a handful of signal writes', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [a] = up.add([file('big', 10_000)])
    let writes = 0
    const stop = effect(() => {
      a!.progress()
      writes++
    })

    for (let i = 1; i <= 10_000; i++) t.calls[0]!.ctx.onProgress(i)
    expect(writes).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(writes).toBe(2)
    expect(a!.progress().loaded).toBe(10_000)
    for (let i = 0; i < 50; i++) t.calls[0]!.ctx.onProgress(10_000)
    await vi.advanceTimersByTimeAsync(100)
    expect(writes).toBe(2)
    stop.dispose()
    up.dispose()
  })

  it('clamps nonsense, ignores a late report from a stopped attempt, and aggregates by bytes', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [a, b] = up.add([file('a', 100), file('b', 300)])

    t.calls[0]!.ctx.onProgress(500)
    t.calls[1]!.ctx.onProgress(NaN)
    t.calls[1]!.ctx.onProgress(-5)
    t.calls[1]!.ctx.onProgress(150)
    await vi.advanceTimersByTimeAsync(100)
    expect(a!.progress().loaded).toBe(100)
    expect(b!.progress().loaded).toBe(150)
    expect(up.progress()).toEqual({ loaded: 250, total: 400, ratio: 0.625 })
    up.pause(b!.id)
    t.calls[1]!.ctx.onProgress(300)
    await vi.advanceTimersByTimeAsync(100)
    expect(b!.progress().loaded).toBe(150)
    up.dispose()
  })

  it('speed and remaining appear once measurable, and an empty file reaches ratio 1 when done', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [a, z] = up.add([file('a', 10_000), file('zero', 0)])

    expect(a!.speed()).toBeNull()
    t.calls[0]!.ctx.onProgress(1000)
    await vi.advanceTimersByTimeAsync(300)
    t.calls[0]!.ctx.onProgress(4000)
    await vi.advanceTimersByTimeAsync(300)
    expect(a!.speed()).toBeGreaterThan(0)
    expect(a!.remaining()).toBeGreaterThan(0)
    expect(z!.progress().ratio).toBe(0)
    t.calls[1]!.resolve()
    await flush()
    expect(z!.progress()).toEqual({ loaded: 0, total: 0, ratio: 1 })
    up.dispose()
  })
})

describe('pause, resume, cancel, remove', () => {
  it('pause aborts the attempt, keeps progress, and resume continues with the saved state', async () => {
    const t = fakeTransport()
    const states: unknown[] = []
    const up = createUploader({ transport: t.transport, onResumeState: (_f, s) => states.push(s) })
    const [a] = up.add([file('a', 100)])

    t.calls[0]!.ctx.onProgress(40)
    t.calls[0]!.ctx.saveResumeState({ offset: 40 })
    await vi.advanceTimersByTimeAsync(100)
    up.pause(a!.id)
    expect(a!.status()).toBe('paused')
    expect(t.calls[0]!.ctx.signal.aborted).toBe(true)
    expect(up.status()).toBe('paused')
    up.resume(a!.id)
    expect(a!.status()).toBe('uploading')
    expect(t.calls[1]!.ctx.resumeState).toEqual({ offset: 40 })
    expect(a!.progress().loaded).toBe(40)
    expect(states).toEqual([{ offset: 40 }])
    t.calls[0]!.resolve('late')
    await flush()
    expect(a!.status()).toBe('uploading')
    up.dispose()
  })

  it('pausing a queued file keeps it out of the line until resumed', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 1 })
    const [a, b] = up.add([file('a'), file('b')])

    up.pause(b!.id)
    expect(b!.status()).toBe('paused')
    t.calls[0]!.resolve()
    await flush()
    expect(t.calls).toHaveLength(1)
    up.resume(b!.id)
    expect(t.calls).toHaveLength(2)
    expect(a!.status()).toBeDefined()
    up.dispose()
  })

  it('cancel aborts, then retry starts over from zero; a transport that never settles does not block it', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 1 })
    const [a, b] = up.add([file('a', 100), file('b')])

    t.calls[0]!.ctx.onProgress(70)
    await vi.advanceTimersByTimeAsync(100)
    up.cancel(a!.id)
    expect(a!.status()).toBe('cancelled')
    expect(t.calls[0]!.ctx.signal.aborted).toBe(true)
    expect(t.calls).toHaveLength(2)
    expect(b!.status()).toBe('uploading')
    up.retry(a!.id)
    expect(a!.progress().loaded).toBe(0)
    expect(a!.attempt()).toBe(1)
    t.calls[1]!.resolve()
    await flush()
    expect(t.calls).toHaveLength(3)
    up.dispose()
  })

  it('remove aborts the upload and drops the file; the line moves on', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 1 })
    const [a, b] = up.add([file('a'), file('b')])

    up.remove(a!.id)
    expect(t.calls[0]!.ctx.signal.aborted).toBe(true)
    expect(up.files().map((f) => f.name)).toEqual(['b'])
    expect(b!.status()).toBe('uploading')
    up.remove('nope')
    up.clear()
    expect(up.files()).toHaveLength(0)
    expect(t.calls[1]!.ctx.signal.aborted).toBe(true)
    up.dispose()
  })

  it('onAllDone fires once when everything has settled, again after a new batch', async () => {
    const t = fakeTransport()
    const all: number[] = []
    const up = createUploader({ transport: t.transport, onAllDone: (files) => all.push(files.length) })

    up.add([file('a'), file('b')])
    t.calls[0]!.resolve()
    await flush()
    expect(all).toEqual([])
    t.calls[1]!.reject(uploadError('server', 'x', { status: 400, retryable: false }))
    await flush()
    expect(all).toEqual([2])
    up.add([file('c')])
    t.calls[2]!.resolve()
    await flush()
    expect(all).toEqual([2, 3])
    up.dispose()
  })

  it('a callback that throws does not stop the queue', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, onDone: () => { throw new Error('app bug') } })
    const [a] = up.add([file('a')])

    t.calls[0]!.resolve()
    await flush()
    expect(a!.status()).toBe('done')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    up.dispose()
  })
})

describe('offline', () => {
  it('pauses uploads when the browser goes offline and resumes them when it is back, and removes its listeners', async () => {
    const target = new EventTarget() as EventTarget & { navigator?: unknown }
    const listeners = { added: 0, removed: 0 }
    const win = Object.assign(target, { addEventListener: (n: string, f: never) => { listeners.added++; EventTarget.prototype.addEventListener.call(target, n, f) }, removeEventListener: (n: string, f: never) => { listeners.removed++; EventTarget.prototype.removeEventListener.call(target, n, f) } })

    vi.stubGlobal('window', win)
    vi.stubGlobal('navigator', { onLine: true })
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [a] = up.add([file('a', 100)])

    expect(listeners.added).toBe(2)
    t.calls[0]!.ctx.onProgress(30)
    win.dispatchEvent(new Event('offline'))
    expect(a!.status()).toBe('paused')
    expect(t.calls[0]!.ctx.signal.aborted).toBe(true)
    up.add([file('b')])
    expect(t.calls).toHaveLength(1)
    win.dispatchEvent(new Event('online'))
    expect(t.calls).toHaveLength(3)
    expect(a!.status()).toBe('uploading')
    win.dispatchEvent(new Event('offline'))
    win.dispatchEvent(new Event('online'))
    win.dispatchEvent(new Event('offline'))
    win.dispatchEvent(new Event('online'))
    expect(up.files().every((f) => f.status() === 'uploading')).toBe(true)
    up.dispose()
    expect(listeners.removed).toBe(2)
  })

  it('pauseWhenOffline false leaves uploads running and attaches nothing', () => {
    const target = new EventTarget()
    const add = vi.spyOn(target, 'addEventListener')

    vi.stubGlobal('window', target)
    const up = createUploader({ transport: fakeTransport().transport, pauseWhenOffline: false })

    up.add([file('a')])
    expect(add).not.toHaveBeenCalled()
    up.dispose()
  })
})

describe('previews and dispose', () => {
  it('creates object URLs for images and videos only, and revokes each on remove, clear and dispose', () => {
    let n = 0
    const created: string[] = []
    const revoked: string[] = []

    vi.stubGlobal('URL', { createObjectURL: () => { const u = `blob:${++n}`; created.push(u); return u }, revokeObjectURL: (u: string) => revoked.push(u) })
    const up = createUploader({ transport: fakeTransport().transport, preview: true, autoStart: false })
    const [img, txt, vid] = up.add([file('a.png', 5, 'image/png'), file('a.txt'), file('v.mp4', 5, 'video/mp4')])

    expect(img!.preview()).toBe('blob:1')
    expect(txt!.preview()).toBeNull()
    expect(vid!.preview()).toBe('blob:2')
    up.remove(img!.id)
    expect(revoked).toEqual(['blob:1'])
    expect(img!.preview()).toBeNull()
    up.dispose()
    expect(revoked).toEqual(['blob:1', 'blob:2'])
    expect(created.length).toBe(revoked.length)
  })

  it('a preview is skipped for a file over the limit, and revoked when a file is rejected after validation', async () => {
    const created: string[] = []
    const revoked: string[] = []

    vi.stubGlobal('URL', { createObjectURL: () => { created.push('x'); return 'blob:x' }, revokeObjectURL: (u: string) => revoked.push(u) })
    const up = createUploader({ transport: fakeTransport().transport, preview: { maxSize: 10 }, autoStart: false })
    const [big] = up.add([file('a.png', 50, 'image/png')])

    expect(big!.preview()).toBeNull()
    expect(created).toHaveLength(0)
    up.dispose()
  })

  it('dispose aborts everything in flight and leaves no timers, listeners or later work', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 2, retry: { backoff: () => 5000 } })

    up.add([file('a'), file('b'), file('c')])
    t.calls[0]!.reject(uploadError('network', 'down'))
    t.calls[1]!.ctx.onProgress(5)
    await flush()
    up.dispose()
    expect(t.calls[1]!.ctx.signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(up.files().every((f) => f.status() === 'cancelled')).toBe(true)
    expect(up.add([file('late')])).toEqual([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.calls).toHaveLength(3)
    up.dispose()
  })

  it('useUploader is the same queue', () => {
    const up = useUploader({ transport: fakeTransport().transport })

    expect(up.files()).toEqual([])
    expect(up.status()).toBe('idle')
    up.dispose()
  })
})
