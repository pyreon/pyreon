import { createHttp } from '../client'
import { createFetchTransport } from '../transport'

// Request streaming needs an HTTP/2 upload server in Chromium. The real Node
// suite proves socket delivery; here the real browser Request constructor
// validates the transport's init against an independent native request. Some
// engines stringify a stream instead of supporting it as an upload body.
function createBody(streamed: boolean) {
  return streamed
    ? new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello'))
          controller.close()
        },
      })
    : 'hello'
}

describe('browser request body initialization', () => {
  for (const streamed of [false, true]) {
    it(`${streamed ? 'streamed' : 'ordinary'} bodies use the appropriate native Request init`, async () => {
      const nativeInit: RequestInit & { duplex?: 'half' } = {
        method: 'POST',
        body: createBody(streamed),
      }
      if (streamed) nativeInit.duplex = 'half'
      const expected = await new Request(new URL('/upload', location.origin), nativeInit).text()
      const body = createBody(streamed)
      let sentBody: BodyInit | null | undefined
      let duplex: unknown
      const transport = createFetchTransport(async (input, init) => {
        sentBody = init?.body
        duplex = (init as RequestInit & { duplex?: string }).duplex
        const request = new Request(input, init)
        return new Response(await request.text())
      })
      const api = createHttp({ baseUrl: location.origin, transport })
      expect(await api.post('/upload', { body }).text()).toBe(expected)
      expect(sentBody).toBe(body)
      expect(duplex).toBe(streamed ? 'half' : undefined)
    })
  }
})
