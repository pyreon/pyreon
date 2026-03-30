import { describe, expect, it, vi } from 'vitest'
import { createISRHandler } from '../isr'

function mockHandler(html = '<html>test</html>') {
  return vi.fn(
    async () =>
      new Response(html, {
        headers: { 'content-type': 'text/html' },
      }),
  )
}

describe('createISRHandler', () => {
  it('returns a function', () => {
    const handler = createISRHandler(mockHandler(), { revalidate: 60 })
    expect(typeof handler).toBe('function')
  })

  it('cache miss — calls handler and returns response', async () => {
    const inner = mockHandler('<html>hello</html>')
    const handler = createISRHandler(inner, { revalidate: 60 })

    const res = await handler(new Request('http://localhost/'))
    const html = await res.text()

    expect(inner).toHaveBeenCalledOnce()
    expect(html).toBe('<html>hello</html>')
    expect(res.headers.get('x-isr-cache')).toBe('MISS')
  })

  it('cache hit — serves from cache without calling handler', async () => {
    const inner = mockHandler()
    const handler = createISRHandler(inner, { revalidate: 60 })

    // First request populates cache
    await handler(new Request('http://localhost/'))
    // Second request should hit cache
    const res = await handler(new Request('http://localhost/'))

    expect(inner).toHaveBeenCalledOnce()
    expect(res.headers.get('x-isr-cache')).toBe('HIT')
  })

  it('passes non-GET requests through', async () => {
    const inner = mockHandler()
    const handler = createISRHandler(inner, { revalidate: 60 })

    const res = await handler(new Request('http://localhost/', { method: 'POST' }))
    expect(inner).toHaveBeenCalledOnce()
    // POST responses don't get ISR headers
    expect(res.headers.get('x-isr-cache')).toBeNull()
  })

  it('caches different paths independently', async () => {
    const inner = vi.fn(async (req: Request) => {
      const url = new URL(req.url)
      return new Response(`page: ${url.pathname}`)
    })
    const handler = createISRHandler(inner, { revalidate: 60 })

    await handler(new Request('http://localhost/a'))
    await handler(new Request('http://localhost/b'))

    const resA = await handler(new Request('http://localhost/a'))
    const resB = await handler(new Request('http://localhost/b'))

    expect(await resA.text()).toBe('page: /a')
    expect(await resB.text()).toBe('page: /b')
    expect(inner).toHaveBeenCalledTimes(2) // only initial misses
  })

  it('includes x-isr-age header', async () => {
    const inner = mockHandler()
    const handler = createISRHandler(inner, { revalidate: 60 })

    await handler(new Request('http://localhost/'))
    const res = await handler(new Request('http://localhost/'))

    expect(res.headers.get('x-isr-age')).toBeDefined()
  })
})
