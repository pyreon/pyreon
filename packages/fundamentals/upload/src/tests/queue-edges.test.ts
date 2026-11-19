// Queue behaviour at its edges, under the unit runner with fake timers and fake transports (`helpers.ts`). Animation frames,
// `window` and object URLs are stubbed where a test needs them; the real browser path is `upload.browser.test.ts` in Chromium.
import { effect } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader } from '../index'
import { uploadError } from '../errors'
import { fakeTransport, file, flush } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A manual animation-frame clock. `honourCancel: false` models a host whose cancelAnimationFrame does not stop a frame. */
function frames(honourCancel = true) {
  const pending = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  let id = 0

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending.set(++id, cb)

    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (n: number) => {
    cancelled.push(n)
    if (honourCancel) pending.delete(n)
  })

  return {
    cancelled,
    pending: () => pending.size,
    run() {
      const due = [...pending.values()]

      pending.clear()
      for (const cb of due) cb(0)
    },
  }
}

describe('progress is written once per animation frame', () => {
  it('many reports become one signal write on the next frame, and the 100 ms fallback timer is cancelled', async () => {
    const raf = frames()
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [f] = up.add([file('a', 1000)])
    let writes = 0
    const stop = effect(() => {
      f!.progress()
      writes++
    })

    await flush()
    const before = writes

    for (let i = 1; i <= 50; i++) t.calls[0]!.ctx.onProgress(i * 10)
    expect(writes).toBe(before)
    expect(raf.pending()).toBe(1)
    raf.run()
    expect(writes).toBe(before + 1)
    expect(f!.progress().loaded).toBe(500)
    expect(vi.getTimerCount()).toBe(0)
    stop.dispose()
    up.dispose()
  })

  it('dispose cancels a pending frame', async () => {
    const raf = frames()
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [f] = up.add([file('a', 1000)])

    await flush()
    t.calls[0]!.ctx.onProgress(100)
    expect(raf.pending()).toBe(1)
    up.dispose()
    expect(raf.cancelled).toHaveLength(1)
    expect(raf.pending()).toBe(0)
    expect(f!.progress().loaded).toBe(0)
  })

  it('a frame that arrives after the fallback already flushed writes nothing more', async () => {
    const raf = frames(false)
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [f] = up.add([file('a', 1000)])
    let writes = 0
    const stop = effect(() => {
      f!.progress()
      writes++
    })

    await flush()
    t.calls[0]!.ctx.onProgress(100)
    await vi.advanceTimersByTimeAsync(100)
    const after = writes

    expect(f!.progress().loaded).toBe(100)
    raf.run()
    expect(writes).toBe(after)
    stop.dispose()
    up.dispose()
  })
})

describe('retry policy', () => {
  it('without a backoff the default one is used: 500 ms doubling, with jitter (here the lowest, half)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: { attempts: 3 } })

    up.add([file('a')])
    await flush()
    t.calls[0]!.reject(uploadError('network', 'down'))
    await vi.advanceTimersByTimeAsync(249)
    expect(t.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.calls).toHaveLength(2)
    t.calls[1]!.reject(uploadError('network', 'down'))
    await vi.advanceTimersByTimeAsync(499)
    expect(t.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.calls).toHaveLength(3)
    up.dispose()
  })
})

describe('resume state', () => {
  it('a state saved by a stopped attempt is ignored; the next attempt gets the last state of a live one', async () => {
    const saved: unknown[] = []
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, onResumeState: (_f, s) => saved.push(s) })
    const [f] = up.add([file('a')])

    await flush()
    t.calls[0]!.ctx.saveResumeState({ part: 1 })
    up.pause(f!.id)
    t.calls[0]!.ctx.saveResumeState({ part: 2 })
    expect(saved).toEqual([{ part: 1 }])
    up.resume(f!.id)
    await flush()
    expect(t.calls[1]!.ctx.resumeState).toEqual({ part: 1 })
    up.dispose()
  })
})

describe('controls with an id that is not in the queue, and on files they do not apply to', () => {
  it('an unknown id changes nothing', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [f] = up.add([file('a')])

    await flush()
    for (const op of ['start', 'pause', 'resume', 'cancel', 'retry', 'remove'] as const) up[op]('nope')
    expect(f!.status()).toBe('uploading')
    expect(up.files()).toHaveLength(1)
    up.dispose()
  })

  it('pause, resume, cancel and retry for all touch only the files each applies to', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: false })
    const [done, failed, live] = up.add([file('a'), file('b'), file('c')])

    await flush()
    t.calls[0]!.resolve('ok')
    t.calls[1]!.reject(uploadError('server', 'no', { status: 400 }))
    await flush()
    expect([done!.status(), failed!.status(), live!.status()]).toEqual(['done', 'failed', 'uploading'])

    up.pause()
    expect([done!.status(), failed!.status(), live!.status()]).toEqual(['done', 'failed', 'paused'])
    up.resume()
    expect([done!.status(), failed!.status(), live!.status()]).toEqual(['done', 'failed', 'uploading'])
    up.retry()
    await flush()
    expect([done!.status(), failed!.status(), live!.status()]).toEqual(['done', 'uploading', 'uploading'])
    up.cancel()
    expect([done!.status(), failed!.status(), live!.status()]).toEqual(['done', 'cancelled', 'cancelled'])
    // live: its first attempt (pause) and its second (cancel); failed: its retry (cancel). The finished upload was never aborted.
    expect(t.calls.map((c) => c.ctx.signal.aborted)).toEqual([false, false, true, true, true])
    up.dispose()
  })
})

describe('offline', () => {
  it('going offline pauses only the files on the wire; queued and finished files keep their state', async () => {
    const win = new EventTarget()

    vi.stubGlobal('window', win)
    vi.stubGlobal('navigator', { onLine: true })
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, concurrency: 1 })
    const [a, b] = up.add([file('a'), file('b')])

    await flush()
    win.dispatchEvent(new Event('offline'))
    expect([a!.status(), b!.status()]).toEqual(['paused', 'queued'])
    win.dispatchEvent(new Event('online'))
    await flush()
    expect([a!.status(), b!.status()]).toEqual(['uploading', 'queued'])
    up.dispose()
  })
})

describe('adding odd inputs', () => {
  it('a meta function that throws a non-Error, for a nameless Blob, is reported with "a file" and the thrown value', () => {
    const up = createUploader({ transport: fakeTransport().transport, meta: () => { throw 'nope' } })

    expect(() => up.add([new Blob(['x'])])).toThrow('[Pyreon] uploader.add: the meta function threw for a file: nope. Return a plain object.')
    expect(up.files()).toEqual([])
    up.dispose()
  })

  it('a nameless Blob is added with an empty name', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const [b] = up.add([new Blob(['xyz'], { type: 'text/plain' })])

    expect(b!.name).toBe('')
    expect(b!.size).toBe(3)
    await flush()
    expect(t.calls[0]!.file.name).toBe('')
    up.dispose()
  })

  it('maxFiles of one says "file is"', () => {
    const up = createUploader({ transport: fakeTransport().transport, rules: { maxFiles: 1 } })
    const [, second] = up.add([file('a'), file('b')])

    expect(second!.rejections()[0]).toMatchObject({ code: 'too-many', message: 'At most 1 file is allowed.' })
    up.dispose()
  })

  it('a preview option object without maxSize uses the 50 MB default', () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:p', revokeObjectURL: () => {} })
    const up = createUploader({ transport: fakeTransport().transport, preview: {}, autoStart: false })
    const [small, big] = up.add([file('a.png', 10, 'image/png'), { ...file('b.png', 1, 'image/png'), size: 60e6, type: 'image/png', slice: () => new Blob() } as unknown as File])

    expect(small!.preview()).toBe('blob:p')
    expect(big!.preview()).toBeNull()
    up.dispose()
  })
})

describe('asynchronous checks', () => {
  const unreadable = (reason: unknown): File => {
    const f = file('a.png', 10, 'image/png')

    Object.defineProperty(f, 'slice', { value: () => ({ arrayBuffer: () => Promise.reject(reason) }) })

    return f
  }

  it('a file that cannot be read for sniffing is rejected with the reason, never uploaded', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, rules: { accept: ['image/*'], sniff: true } })
    const [a, b] = up.add([unreadable(new Error('the disk went away')), unreadable('weird')])

    expect(a!.status()).toBe('validating')
    await flush()
    expect(a!.status()).toBe('rejected')
    expect(a!.rejections()[0]).toMatchObject({ code: 'custom', message: 'the disk went away' })
    expect(b!.rejections()[0]).toMatchObject({ code: 'custom', message: 'The file could not be checked.' })
    expect(t.calls).toHaveLength(0)
    up.dispose()
  })

  it('a check that finishes after dispose starts nothing', async () => {
    let pass!: (v: string | null) => void
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, rules: { custom: () => new Promise((r) => { pass = r }) } })
    const [f] = up.add([file('a')])

    await flush()
    expect(f!.status()).toBe('validating')
    up.dispose()
    expect(f!.status()).toBe('cancelled')
    pass(null)
    await flush()
    expect(f!.status()).toBe('cancelled')
    expect(t.calls).toHaveLength(0)
  })
})
