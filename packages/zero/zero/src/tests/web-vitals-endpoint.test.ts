import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebVitalMetric } from '../web-vitals'
import { reportWebVitals, sendToBeacon, webVitalsEndpoint } from '../web-vitals'

const metric: WebVitalMetric = {
  name: 'LCP', value: 1200, delta: 1200, rating: 'good', id: 'v1-1', path: '/', navigationType: 'navigate',
}
const post = (body: string, method = 'POST') => {
  const req = new Request('https://x.test/api/vitals', method === 'POST' ? { method, body } : { method })
  return { req, url: new URL(req.url) }
}

afterEach(() => vi.unstubAllGlobals())

describe('webVitalsEndpoint', () => {
  it('accepts a well-formed metric with 204', async () => {
    const seen: WebVitalMetric[] = []
    const res = await webVitalsEndpoint('/api/vitals', (m) => void seen.push(m))(post(JSON.stringify(metric)))
    expect(res!.status).toBe(204)
    expect(seen[0]!.name).toBe('LCP')
  })
  it('rejects malformed / wrong-method / oversize bodies and ignores other paths', async () => {
    const mw = webVitalsEndpoint('/api/vitals', () => {})
    expect((await mw(post('{nope')))!.status).toBe(400)
    expect((await mw(post(JSON.stringify({ ...metric, name: 'XSS' }))))!.status).toBe(400)
    expect((await mw(post(JSON.stringify({ ...metric, value: 'x' }))))!.status).toBe(400)
    expect((await mw(post(JSON.stringify({ ...metric, pad: 'x'.repeat(5000) }))))!.status).toBe(413)
    expect((await mw(post('', 'GET')))!.status).toBe(405)
    const other = new Request('https://x.test/other', { method: 'POST', body: '{}' })
    expect(await mw({ req: other, url: new URL(other.url) })).toBeUndefined()
  })
})

describe('webVitalsEndpoint — payload shape validation', () => {
  it('400s for non-object JSON, a non-finite value, and a missing id or path', async () => {
    const mw = webVitalsEndpoint('/api/vitals', () => {
      throw new Error('onMetric must not run for an invalid body')
    })
    for (const body of [
      'null',
      '42',
      '"LCP"',
      // JSON.parse turns 1e999 into Infinity — valid JSON, not a usable metric.
      JSON.stringify({ ...metric }).replace('1200,', '1e999,'),
      JSON.stringify({ ...metric, id: 7 }),
      JSON.stringify({ ...metric, path: undefined }),
    ]) {
      expect((await mw(post(body)))!.status, body).toBe(400)
    }
  })

  it('awaits an async onMetric and hands it the original request', async () => {
    const order: string[] = []
    let seenReq: Request | null = null
    const mw = webVitalsEndpoint('/api/vitals', async (m, req) => {
      await Promise.resolve()
      seenReq = req
      order.push(`metric:${m.name}`)
    })
    const ctx = post(JSON.stringify({ ...metric, name: 'CLS', value: 0.02 }))
    const res = await mw(ctx)
    order.push('responded')
    expect(res!.status).toBe(204)
    expect(order).toEqual(['metric:CLS', 'responded'])
    expect(seenReq).toBe(ctx.req)
  })
})

describe('sendToBeacon / server no-op', () => {
  it('falls back to fetch when navigator has no sendBeacon, and swallows a fetch rejection', async () => {
    vi.stubGlobal('navigator', {})
    const f = vi.fn(() => Promise.reject(new Error('offline')))
    vi.stubGlobal('fetch', f)
    expect(() => sendToBeacon('/v')(metric)).not.toThrow()
    expect(f).toHaveBeenCalledOnce()
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual(metric)
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    // Let the rejected promise settle: an unhandled rejection would fail the run.
    await new Promise((r) => setTimeout(r, 0))
  })

  it('uses navigator.sendBeacon when it accepts, else fetch keepalive', () => {
    const beacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    const f = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal('fetch', f)
    sendToBeacon('/v')(metric)
    expect(beacon).toHaveBeenCalledOnce()
    expect(f).not.toHaveBeenCalled()
    beacon.mockReturnValue(false)
    sendToBeacon('/v')(metric)
    expect(f).toHaveBeenCalledWith('/v', expect.objectContaining({ keepalive: true, method: 'POST' }))
  })
  it('reportWebVitals is a no-op without a DOM', () => {
    const stop = reportWebVitals(() => {})
    expect(typeof stop).toBe('function')
    stop()
  })
})
