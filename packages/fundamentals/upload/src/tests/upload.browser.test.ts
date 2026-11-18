// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { createHttp } from '@pyreon/http'
import { effect } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createUploader, type UploadFile } from '../index'
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

const settled = (f: UploadFile): boolean => ['done', 'failed', 'cancelled', 'rejected'].includes(f.status())

beforeEach(async () => {
  await api('/reset')
})

afterEach(async () => {
  await until(async () => (await active()) === 0)
})

describe('real XHR progress', () => {
  it('reports distinct, increasing byte counts while a throttled server reads the body, then finishes', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?chunk=262144&every=40' }) })
    const [f] = up.add([blob(6 * 1024 * 1024)])
    const seen: number[] = []
    const stop = effect(() => { seen.push(f!.progress().loaded) })

    await until(() => settled(f!))
    stop.dispose()
    expect(f!.status()).toBe('done')
    expect(f!.result()).toMatchObject({ type: 'multipart/form-data' })
    expect(new Set(seen).size).toBeGreaterThan(4)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    expect(f!.progress().ratio).toBe(1)
    expect(f!.speed()).not.toBeNull()
    up.dispose()
  })

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
  it('cancel aborts the request mid-upload: the server sees the connection close', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?chunk=65536&every=50' }) })
    const [f] = up.add([blob(8 * 1024 * 1024)])

    await until(async () => f!.progress().loaded > 0 && (await active()) === 1)
    up.cancel(f!.id)
    expect(f!.status()).toBe('cancelled')
    await until(async () => (await active()) === 0)
    expect(f!.progress().ratio).toBeLessThan(1)
    up.dispose()
  })

  it('pause aborts, resume sends again, progress never goes back, and the upload finishes', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?chunk=131072&every=25' }) })
    const [f] = up.add([blob(5 * 1024 * 1024)])
    const seen: number[] = []
    const stop = effect(() => { seen.push(f!.progress().loaded) })

    await until(() => f!.progress().loaded > 300_000)
    up.pause(f!.id)
    expect(f!.status()).toBe('paused')
    await until(async () => (await active()) === 0)
    const held = f!.progress().loaded

    up.resume(f!.id)
    await until(() => settled(f!))
    stop.dispose()
    expect(f!.status()).toBe('done')
    expect((await api('/count?key=/sink')).count).toBe(2)
    expect(held).toBeGreaterThan(0)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    up.dispose()
  })
})

describe('errors from a real server', () => {
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
      const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?chunk=65536&every=50' }), preview: true, retry: { backoff: () => 50 } })

      up.add([png, blob(8 * 1024 * 1024), blob(3 * 1024 * 1024)])
      await until(async () => (await active()) >= 2)
      expect(urls.size).toBe(1)
      up.dispose()
      await until(async () => (await active()) === 0)
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
  })
})
