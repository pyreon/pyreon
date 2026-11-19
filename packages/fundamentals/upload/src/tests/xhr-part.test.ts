// The request helper the resumable transports share, on the XHR double (`fake-xhr.ts`); its real path is every request of
// `resumable.browser.test.ts` in Chromium.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool, sendPart, stopReason } from '../xhr-part'
import { installFakeXhr, tick } from './fake-xhr'

let xhr: ReturnType<typeof installFakeXhr>

beforeEach(() => {
  xhr = installFakeXhr()
})

afterEach(() => {
  xhr.restore()
})

const signal = (): AbortSignal => new AbortController().signal

describe('sendPart', () => {
  it('sends with no headers when none are given and resolves status, headers, parsed body and text', async () => {
    const p = sendPart({ url: '/x', method: 'GET', signal: signal() })
    const r = xhr.last()

    expect(r.headers).toEqual({})
    expect(r.body).toBeNull()
    r.respond({ status: 200, body: '{"a":1}', headers: { 'Content-Type': 'application/json', ETag: '"e"' } })
    const res = await p

    expect(res).toMatchObject({ status: 200, body: { a: 1 }, text: '{"a":1}' })
    expect(res.headers.get('etag')).toBe('"e"')
  })

  it('a body that claims JSON but is not stays text; an empty body is undefined', async () => {
    const a = sendPart({ url: '/x', method: 'GET', signal: signal() })

    xhr.last().respond({ status: 200, body: '<html>', headers: { 'content-type': 'application/json' } })
    expect((await a).body).toBe('<html>')
    const b = sendPart({ url: '/x', method: 'GET', signal: signal() })

    xhr.last().respond({ status: 204 })
    expect((await b).body).toBeUndefined()
  })

  it('accepts the statuses the caller says; others are typed server errors with Retry-After', async () => {
    const ok = sendPart({ url: '/x', method: 'HEAD', signal: signal() }, (s) => s === 404)

    xhr.last().respond({ status: 404 })
    expect((await ok).status).toBe(404)
    const bad = sendPart({ url: '/x', method: 'PUT', signal: signal() })

    xhr.last().respond({ status: 429, headers: { 'retry-after': '3' } })
    await expect(bad).rejects.toMatchObject({ kind: 'server', status: 429, retryable: true, retryAfter: 3000 })
  })

  it('progress is scaled to the part size when it is known and the event is computable, else raw bytes', async () => {
    const seen: number[] = []
    const a = sendPart({ url: '/x', method: 'PUT', body: 'abcd', size: 100, onProgress: (n) => seen.push(n), signal: signal() })

    xhr.last().progress(10, 20)
    xhr.last().progress(7, 0, false)
    xhr.last().respond({ status: 200 })
    await a
    const b = sendPart({ url: '/x', method: 'PUT', body: 'abcd', onProgress: (n) => seen.push(n), signal: signal() })

    xhr.last().progress(3, 4)
    xhr.last().respond({ status: 200 })
    await b
    expect(seen).toEqual([50, 7, 3])
  })

  it('a timeout is a retryable timeout error; a network error a retryable network error', async () => {
    const a = sendPart({ url: '/x', method: 'PUT', timeout: 10, signal: signal() })

    expect(xhr.last().timeout).toBe(10)
    xhr.last().expire()
    await expect(a).rejects.toMatchObject({ kind: 'timeout', retryable: true })
    const b = sendPart({ url: '/x', method: 'PUT', signal: signal() })

    xhr.last().fail()
    await expect(b).rejects.toMatchObject({ kind: 'network', retryable: true })
  })

  it('an abort carries the cause the queue gave; an already aborted signal sends nothing', async () => {
    const c = new AbortController()
    const a = sendPart({ url: '/x', method: 'PUT', signal: c.signal })

    c.abort({ cause: 'cancel' })
    await expect(a).rejects.toMatchObject({ kind: 'aborted', cause: 'cancel', retryable: false })
    const b = sendPart({ url: '/x', method: 'PUT', signal: c.signal })

    await expect(b).rejects.toMatchObject({ kind: 'aborted', cause: 'cancel' })
    expect(xhr.last().sent).toBe(false)
    const d = new AbortController()

    d.abort()
    await expect(sendPart({ url: '/x', method: 'PUT', signal: d.signal })).rejects.toMatchObject({ kind: 'aborted', cause: undefined })
  })
})

describe('stopReason', () => {
  it('is the string cause of the abort reason, else undefined', () => {
    const c = new AbortController()

    expect(stopReason({ signal: c.signal })).toBeUndefined()
    c.abort({ cause: 'pause' })
    expect(stopReason({ signal: c.signal })).toBe('pause')
    const d = new AbortController()

    d.abort({ cause: 3 })
    expect(stopReason({ signal: d.signal })).toBeUndefined()
  })
})

describe('pool', () => {
  it('runs at most `parallel` at once, all items, in order of start', async () => {
    let running = 0
    let most = 0
    const started: number[] = []

    await pool([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n)
      running++
      most = Math.max(most, running)
      await tick(3)
      running--
    })
    expect(started).toEqual([1, 2, 3, 4, 5])
    expect(most).toBe(2)
  })

  it('stops starting new items after the first failure, waits for the running ones, and throws the first error', async () => {
    const started: number[] = []
    const p = pool([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n)
      await tick(n === 1 ? 1 : 5)
      if (n === 1 || n === 2) throw new Error(`fail ${n}`)
    })

    await expect(p).rejects.toThrow('fail 1')
    expect(started).toEqual([1, 2])
  })

  it('an empty list resolves at once', async () => {
    await expect(pool([], 3, async () => {})).resolves.toBeUndefined()
  })
})
