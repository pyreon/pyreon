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

describe('sendToBeacon / server no-op', () => {
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
