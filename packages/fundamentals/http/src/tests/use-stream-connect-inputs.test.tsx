/**
 * `useStream` over `openEventStream` + a `@pyreon/http` endpoint — the
 * DOCUMENTED shape, where the stream's inputs are read inside `connect`:
 *
 *   useStream((ctx) => openEventStream((c) => feed({ params: { room: props.room }, … }), …))
 *
 * `connect` runs in the iterator's first step, not in the source call. On the
 * web that step used to run untracked, so a changed `room` never reopened the
 * stream — while the native lowering (whose harness key carries the URL and
 * the body) did. This locks the web to the documented behaviour, over the real
 * endpoint + mock transport rather than a hand-rolled iterable.
 */
import { _rp, h } from '@pyreon/core'
import { QueryClientProvider, useStream, type UseStreamResult } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { createHttp } from '../client'
import { createMock } from '../mock'
import { openEventStream, type SseEvent } from '../stream'

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

async function until(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !pred(); i++) await tick()
}

describe('useStream — inputs read inside connect', () => {
  it('reopens the stream when a prop read inside connect changes, dropping the old stream', async () => {
    const handle = createMock([
      {
        path: /\/rooms\/[^/]+\/feed$/,
        accept: 'text/event-stream',
        headers: { 'content-type': 'text/event-stream' },
        body: (call) => `data: ${JSON.stringify({ room: /\/rooms\/([^/]+)\//.exec(call.url)?.[1] })}\n\n`,
      },
    ])
    const api = createHttp({ baseUrl: 'https://x.test', use: [handle.middleware] })
    const feed = api.endpoint('GET /rooms/:room/feed', { responseType: 'stream' })

    const aborts: AbortSignal[] = []
    let s!: UseStreamResult<SseEvent<{ room: string }>>
    function Feed(props: { room: string }) {
      s = useStream<SseEvent<{ room: string }>>((ctx) => {
        aborts.push(ctx.signal)
        return openEventStream<{ room: string }>(
          (c) => feed({ params: { room: props.room }, signal: c.signal, headers: c.headers }),
          { signal: ctx.signal, onStatus: ctx.onStatus, reconnect: false },
        )
      })
      return null
    }

    const room = signal('a')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client: new QueryClient() }, h(Feed, { room: _rp(() => room()) })),
      el,
    )

    await until(() => s.events().length > 0)
    expect(s.events().map((e) => e.data.room)).toEqual(['a'])

    room.set('b')
    expect(aborts).toHaveLength(2)
    expect(aborts[0]?.aborted).toBe(true)
    await until(() => s.events().length > 0)
    expect(s.events().map((e) => e.data.room)).toEqual(['b'])
    expect(handle.calls.map((c) => c.url)).toEqual([
      'https://x.test/rooms/a/feed',
      'https://x.test/rooms/b/feed',
    ])

    unmount()
    el.remove()
    expect(aborts[1]?.aborted).toBe(true)
  })
})
