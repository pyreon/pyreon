import { describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { createFetchTransport } from '../transport'

// Request streaming needs an HTTP/2 upload server in Chromium. The real Node
// suite proves socket delivery; here the real browser Request constructor
// validates the transport's init and consumes its actual ReadableStream.
describe('browser request body initialization', () => {
  for (const streamed of [false, true]) {
    it(`${streamed ? 'streamed' : 'ordinary'} bodies use the appropriate native Request init`, async () => {
      let duplex: unknown
      const transport = createFetchTransport(async (input, init) => {
        duplex = (init as RequestInit & { duplex?: string }).duplex
        const request = new Request(input, init)
        return new Response(await request.text())
      })
      const api = createHttp({ baseUrl: location.origin, transport })
      const body = streamed
        ? new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('hello'))
              controller.close()
            },
          })
        : 'hello'
      expect(await api.post('/upload', { body }).text()).toBe('hello')
      expect(duplex).toBe(streamed ? 'half' : undefined)
    })
  }
})
