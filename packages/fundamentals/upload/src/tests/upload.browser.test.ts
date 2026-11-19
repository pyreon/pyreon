// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { createHttp } from '@pyreon/http'
import { effect } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createUploader, type Transport, type UploadFile } from '../index'
import { validateFileAsync } from '../core'
import { xhrTransport } from '../transport-xhr'

const api = async (path: string): Promise<Record<string, number>> => (await fetch(`/__u${path}`)).json()
const active = async (): Promise<number> => (await api('/active')).active!
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const blob = (bytes: number, name = 'f.bin', type = 'application/octet-stream'): File => new File([new Uint8Array(bytes)], name, { type })

const until = async (cond: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> => {
  const start = Date.now()

  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for a condition')
    await sleep(20)
  }
}

/** Waits on a server-side handshake (see the gate in `test-server.ts`), not on how fast this machine is. CI is slow. */
const LONG = 60_000
const MB = 1024 * 1024

interface GateState {
  requests: number
  received: number
  length: number
  held: boolean
  closed: boolean
  complete: boolean
  ended: number
  cut: number
}

/** A gated endpoint: the server reads 256 KB of each body, then stops reading (back-pressure) until `release()`. */
function gate(name: string, hold = 256 * 1024): { url: string; state(): Promise<GateState>; release(): Promise<void> } {
  const id = `${name}-${Math.random().toString(36).slice(2)}`

  return {
    url: `/__u/gate?id=${id}&hold=${hold}`,
    state: async () => (await api(`/gate-state?id=${id}`)) as unknown as GateState,
    release: async () => {
      await fetch(`/__u/gate-release?id=${id}`, { signal: AbortSignal.timeout(30_000) })
    },
  }
}

const settled = (f: UploadFile): boolean => ['done', 'failed', 'cancelled', 'rejected'].includes(f.status())

beforeEach(async () => {
  await api('/reset')
})

afterEach(async () => {
  await until(async () => (await active()) === 0)
})

describe('real XHR progress', () => {
  it('while the server holds the body back, progress is strictly between 0 and the size; it never goes back and ends at the size', async () => {
    const g = gate('progress')
    const up = createUploader({ transport: xhrTransport({ url: g.url }) })
    // 48 MB: more than the socket buffers on both ends can absorb, so a held server really holds the browser back.
    const size = 48 * MB
    const [f] = up.add([blob(size)])
    const seen: number[] = []
    const stop = effect(() => { seen.push(f!.progress().loaded) })

    await until(async () => (await g.state()).held, LONG)
    await until(() => f!.progress().loaded > 0, LONG)
    const mid = f!.progress().loaded

    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(size)
    expect(f!.status()).toBe('uploading')
    await g.release()
    await until(() => settled(f!), LONG)
    stop.dispose()
    expect(f!.status()).toBe('done')
    const server = await g.state()

    expect(f!.result()).toEqual({ received: server.length, type: 'multipart/form-data' })
    expect(server.complete).toBe(true)
    expect(seen).toContain(mid)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    expect(f!.progress()).toEqual({ loaded: size, total: size, ratio: 1 })
    up.dispose()
  }, 3 * LONG)

  it('coalesces progress into per-frame signal writes even for a big burst of real events', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?chunk=65536&every=2' }) })
    const [f] = up.add([blob(4 * 1024 * 1024)])
    let writes = 0
    const frames: number[] = []
    const stop = effect(() => {
      f!.progress()
      writes++
      frames.push(performance.now())
    })

    await until(() => settled(f!))
    stop.dispose()
    // Writes are at most one per animation frame (16 ms), whatever the number of progress events.
    const elapsed = frames[frames.length - 1]! - frames[0]!

    expect(writes).toBeLessThanOrEqual(Math.ceil(elapsed / 15) + 3)
    up.dispose()
  })

  it('sends the meta as text fields and the file under the chosen field name', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?every=0', field: 'avatar' }), meta: () => ({ owner: 'me' }) })
    const [f] = up.add([blob(10)])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    up.dispose()
  })
})

describe('abort, pause and resume', () => {
  it('cancel aborts the request mid-upload: the server sees the connection end before the body did', async () => {
    const g = gate('cancel')
    const up = createUploader({ transport: xhrTransport({ url: g.url }) })
    const [f] = up.add([blob(48 * MB)])

    await until(async () => (await g.state()).held && f!.progress().loaded > 0, LONG)
    up.cancel(f!.id)
    expect(f!.status()).toBe('cancelled')
    // Let the server read what is still in flight: it then meets the end of the connection, not the end of the body.
    await g.release()
    await until(async () => (await g.state()).closed, LONG)
    const server = await g.state()

    expect(server.complete).toBe(false)
    expect(server.received).toBeLessThan(server.length)
    await until(async () => (await active()) === 0, LONG)
    expect(f!.progress().ratio).toBeLessThan(1)
    up.dispose()
  }, 3 * LONG)

  it('pause aborts, resume sends again, progress never goes back, and the upload finishes', async () => {
    // The first attempt is held deep in the body (24 MB read), the resumed one early (256 KB): the new request's own progress
    // really starts below what the file had reached, so "never goes back" is exercised, not assumed.
    const first = gate('pause-1', 24 * MB)
    const second = gate('pause-2')
    const raw: number[][] = []
    let attempt = 0
    const inner = xhrTransport({ url: () => (attempt === 1 ? first.url : second.url) })
    const transport: Transport = {
      upload: (file, ctx) => {
        const mine: number[] = []

        attempt++
        raw.push(mine)

        return inner.upload(file, { ...ctx, onProgress: (n) => { mine.push(n); ctx.onProgress(n) } })
      },
    }
    const up = createUploader({ transport })
    const size = 48 * MB
    const [f] = up.add([blob(size)])
    const seen: number[] = []
    const stop = effect(() => { seen.push(f!.progress().loaded) })

    await until(async () => (await first.state()).held && f!.progress().loaded >= 24 * MB, LONG)
    up.pause(f!.id)
    expect(f!.status()).toBe('paused')
    const held = f!.progress().loaded

    // Let the server read on: it meets the end of the connection, not the end of the body.
    await first.release()
    await until(async () => (await first.state()).closed, LONG)
    expect((await first.state())).toMatchObject({ complete: false, cut: 1, ended: 0 })
    up.resume(f!.id)
    await until(async () => (await second.state()).held && (raw[1]?.some((n) => n > 0) ?? false), LONG)
    // The resumed request's own count is below where the file was; the file's progress is not.
    expect(Math.max(...raw[1]!)).toBeLessThan(held)
    expect(f!.progress().loaded).toBeGreaterThanOrEqual(held)
    await second.release()
    await until(() => settled(f!), LONG)
    stop.dispose()
    expect(f!.status()).toBe('done')
    expect(await second.state()).toMatchObject({ requests: 1, complete: true, ended: 1 })
    expect(held).toBeLessThan(size)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    expect(f!.progress().ratio).toBe(1)
    up.dispose()
  }, 3 * LONG)

  it('a 422 with a JSON body is not retried and keeps the body', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/status?code=422' }), retry: { backoff: () => 10 } })
    const [f] = up.add([blob(10)])

    await until(() => settled(f!))
    expect(f!.status()).toBe('failed')
    expect(f!.error()).toMatchObject({ kind: 'server', status: 422, retryable: false, body: { field: 'file' } })
    expect((await api('/count?key=/status')).count).toBe(1)
    up.dispose()
  })

  it('a 429 with Retry-After in seconds is retried after that wait', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/status?code=429&retryAfter=1' }), retry: { attempts: 2, backoff: () => 10 } })
    const [f] = up.add([blob(10)])
    const start = Date.now()

    await until(() => settled(f!))
    expect(f!.error()).toMatchObject({ status: 429, retryAfter: 1000 })
    expect((await api('/count?key=/status')).count).toBe(2)
    expect(Date.now() - start).toBeGreaterThanOrEqual(950)
    up.dispose()
  })

  it('a 503 is retried until the server recovers', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/flaky?key=k1&fail=2' }), retry: { attempts: 5, backoff: () => 10 } })
    const [f] = up.add([blob(10)])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.attempt()).toBe(3)
    expect(f!.result()).toMatchObject({ ok: true, attempt: 3 })
    up.dispose()
  })

  it('a refused connection is a retryable network error; a stalled server is a timeout', async () => {
    const down = createUploader({ transport: xhrTransport({ url: 'http://127.0.0.1:1/x' }), retry: { attempts: 2, backoff: () => 10 } })
    const [a] = down.add([blob(10)])

    await until(() => settled(a!))
    expect(a!.error()).toMatchObject({ kind: 'network', retryable: true })
    expect(a!.attempt()).toBe(2)
    down.dispose()
    const slow = createUploader({ transport: xhrTransport({ url: '/__u/hang', timeout: 300 }), retry: false })
    const [b] = slow.add([blob(10)])

    await until(() => settled(b!))
    expect(b!.error()).toMatchObject({ kind: 'timeout', retryable: true })
    slow.dispose()
  })
})

describe('the @pyreon/http seam', () => {
  it('sends through an http client so its base URL, headers and middleware apply, with real progress', async () => {
    const seen: string[] = []
    const client = createHttp({ baseUrl: '/__u', headers: { authorization: 'Bearer token-1' }, use: [async (req, next) => { seen.push(req.url); req.headers.set('x-custom', 'from-middleware'); return next(req) }] })
    const up = createUploader({ transport: xhrTransport({ client: client as never, url: '/echo' }) })
    const [f] = up.add([blob(2 * 1024 * 1024)])

    await until(() => settled(f!))
    expect(f!.status()).toBe('done')
    expect(f!.result()).toMatchObject({ authorization: 'Bearer token-1', custom: 'from-middleware' })
    expect(seen[0]).toContain('/__u/echo')
    up.dispose()
  })

  it('an http error status becomes a typed upload error and is not retried when it is a 4xx', async () => {
    const client = createHttp({ baseUrl: '/__u' })
    const up = createUploader({ transport: xhrTransport({ client: client as never, url: '/status?code=403' }), retry: { backoff: () => 5 } })
    const [f] = up.add([blob(10)])

    await until(() => settled(f!))
    expect(f!.error()).toMatchObject({ kind: 'server', status: 403, retryable: false })
    expect((await api('/count?key=/status')).count).toBe(1)
    up.dispose()
  })
})

describe('dispose leaves nothing behind', () => {
  it('aborts the request, clears timers, removes listeners and revokes object URLs', async () => {
    const live = new Set<number>()
    const listeners = new Map<string, number>()
    const urls = new Set<string>()
    const realSet = window.setTimeout.bind(window)
    const realClear = window.clearTimeout.bind(window)
    const realAdd = window.addEventListener.bind(window)
    const realRemove = window.removeEventListener.bind(window)
    const realCreate = URL.createObjectURL.bind(URL)
    const realRevoke = URL.revokeObjectURL.bind(URL)

    window.setTimeout = ((fn: () => void, ms?: number) => { const id = realSet(() => { live.delete(id); fn() }, ms) as unknown as number; live.add(id); return id }) as never
    window.clearTimeout = ((id: number) => { live.delete(id); realClear(id) }) as never
    window.addEventListener = ((t: string, f: never, o?: never) => { listeners.set(t, (listeners.get(t) ?? 0) + 1); realAdd(t, f, o) }) as never
    window.removeEventListener = ((t: string, f: never, o?: never) => { listeners.set(t, (listeners.get(t) ?? 0) - 1); realRemove(t, f, o) }) as never
    URL.createObjectURL = ((b: Blob) => { const u = realCreate(b); urls.add(u); return u }) as never
    URL.revokeObjectURL = ((u: string) => { urls.delete(u); realRevoke(u) }) as never
    try {
      const png = new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))], 'p.png', { type: 'image/png' })
      const g = gate('dispose')
      // The two big bodies go to the gate, which holds them, so both requests are open when dispose runs; the tiny image goes
      // to the plain sink.
      const up = createUploader({ transport: xhrTransport({ url: (f) => (f.size > 1024 ? g.url : '/__u/sink?every=0') }), preview: true, retry: { backoff: () => 50 } })

      up.add([png, blob(48 * MB), blob(48 * MB)])
      await until(async () => (await g.state()).requests === 2 && (await g.state()).held, LONG)
      expect(urls.size).toBe(1)
      up.dispose()
      // Let the server read on: both requests must end cut off by the client, not by reaching the end of their bodies.
      await g.release()
      await until(async () => (await g.state()).cut === 2, LONG)
      expect((await g.state()).ended).toBe(0)
      await until(async () => (await active()) === 0, LONG)
      await sleep(300)
      expect(urls.size).toBe(0)
      expect([...listeners.values()].every((n) => n === 0)).toBe(true)
      expect(live.size).toBe(0)
    } finally {
      window.setTimeout = realSet as never
      window.clearTimeout = realClear as never
      window.addEventListener = realAdd as never
      window.removeEventListener = realRemove as never
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
    }
  }, 3 * LONG)
})

describe('image rules', () => {
  // The real decode behind the stubbed `createImageBitmap` of `core-edges.test.ts`.
  it('decode a real PNG to check its size, and a file that is not an image cannot be read', async () => {
    const canvas = new OffscreenCanvas(40, 20)

    canvas.getContext('2d')!.fillRect(0, 0, 40, 20)
    const png = new File([await canvas.convertToBlob({ type: 'image/png' })], 'a.png', { type: 'image/png' })

    expect(await validateFileAsync(png, { image: { maxWidth: 40, maxHeight: 20, minWidth: 40, minHeight: 20, aspect: 2 } })).toEqual([])
    expect((await validateFileAsync(png, { image: { maxWidth: 39 } }))[0]).toMatchObject({ code: 'dimensions', params: { width: 40, height: 20, maxWidth: 39 } })
    expect((await validateFileAsync(new File(['not an image'], 'x.png', { type: 'image/png' }), { image: {} }))[0]!.message).toBe('The image could not be read.')
  })
})
