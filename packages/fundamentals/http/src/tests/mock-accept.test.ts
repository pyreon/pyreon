/**
 * `MockRoute.accept` and a computed `body` — what a streaming mock needs.
 *
 * One URL can answer JSON to a plain call and a stream to a streaming one, and
 * an SSE mock can resume after `last-event-id` the way a real server does.
 */
import { createHttp } from '../client'
import { createMock } from '../mock'
import { readEventStream } from '../stream'

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

const EVENTS = ['a', 'b', 'c']
const sse = (after: string | undefined): string => {
  const from = after === undefined ? 0 : Number(after)
  return EVENTS.slice(from).map((e, i) => `id: ${from + i + 1}\ndata: ${e}\n\n`).join('')
}

describe('mock routes for streams', () => {
  const handle = createMock([
    {
      path: '/chat',
      accept: 'text/event-stream',
      headers: { 'content-type': 'text/event-stream' },
      body: (call) => sse(call.headers['last-event-id']),
    },
    { path: '/chat', json: { text: 'whole' } },
  ])
  const api = createHttp({ baseUrl: 'https://x.test', use: [handle.middleware] })

  it('answers JSON without the Accept, and the stream with it (parameters and case ignored)', async () => {
    expect(await api.get('/chat').json()).toEqual({ text: 'whole' })
    const res = await api.get('/chat', { headers: { accept: 'application/json, Text/Event-Stream;q=0.9' } })
    const body = (await collect(readEventStream(res.raw.body as ReadableStream<Uint8Array>))).map((m) => m.data)
    expect(body).toEqual(['a', 'b', 'c'])
  })

  it('computes the body from the recorded call — an SSE mock resumes after last-event-id', async () => {
    const res = await api.get('/chat', { headers: { accept: 'text/event-stream', 'last-event-id': '1' } })
    const msgs = await collect(readEventStream(res.raw.body as ReadableStream<Uint8Array>))
    expect(msgs.map((m) => [m.id, m.data])).toEqual([
      ['2', 'b'],
      ['3', 'c'],
    ])
  })

  it('an `accept` route never matches a request that sent no Accept', async () => {
    const only = createMock([
      { path: '/s', accept: 'text/event-stream', body: 'stream' },
      { path: '/s', body: 'plain' },
    ])
    const client = createHttp({ baseUrl: 'https://x.test', use: [only.middleware] })
    expect(await client.get('/s').text()).toBe('plain')
  })
})
