/**
 * The generated axios client streams in a REAL browser.
 *
 * Its stream path runs through axios's `fetch` adapter (the default adapter is
 * XHR in a browser, which cannot stream at all). The node suite
 * (`stream-runtime.test.ts`) proves the same path against node's fetch; this
 * proves it against Chromium's, including a connection dropped mid-event and
 * the `Last-Event-ID` resume.
 */
interface RoomEvent {
  id: string
  data: { kind: string; at: number }
}
interface Generated {
  configureApi(settings: Record<string, unknown>): void
  roomEventsStream(
    args: { params: { room: string } },
    options?: { reconnect?: { delay?: number } },
  ): AsyncIterable<RoomEvent>
}

async function load(): Promise<Generated> {
  // Written by the globalSetup; a runtime path keeps `tsc` from requiring it.
  // ONE entry module: importing `client.ts` and `endpoints/rooms.ts` by URL
  // separately gives two copies of `client.ts` (a dev server keys modules by
  // URL), and `configureApi` would configure the one the endpoint never reads.
  // (Not `new URL(…, import.meta.url)`: Vite rewrites that pattern as an
  // asset reference, and a template with a variable part becomes `undefined`.)
  const dir = import.meta.url.replace(/[^/]*$/, '')
  return (await import(/* @vite-ignore */ `${dir}.generated/browser-axios/index.ts`)) as Generated
}

describe('generated axios client — streams in Chromium', () => {
  it('reassembles a split event, reconnects a dropped connection, and resumes with Last-Event-ID', async () => {
    expect(navigator.userAgent).toContain('Chrome')
    await fetch('/__lathe_sse/reset')
    const gen = await load()
    gen.configureApi({ baseUrl: `${location.origin}/__lathe_sse/v1`, headers: { authorization: 'Bearer t0k' } })
    const events: RoomEvent[] = []
    for await (const e of gen.roomEventsStream({ params: { room: 'lobby' } }, { reconnect: { delay: 1 } })) events.push(e)
    expect(events.map((e) => [e.id, e.data.kind, e.data.at])).toEqual([
      ['1', 'join', 1],
      ['2', 'leave', 2],
    ])
    const seen = (await (await fetch('/__lathe_sse/seen')).json()) as Array<{ lastEventId?: string; accept?: string; auth?: string }>
    expect(seen.map((s) => s.lastEventId ?? null)).toEqual([null, '1'])
    expect(seen.every((s) => s.accept?.includes('text/event-stream'))).toBe(true)
    // configureApi's headers reached the server: the stream is a call through
    // this axios instance, not a side channel around it.
    expect(seen.every((s) => s.auth === 'Bearer t0k')).toBe(true)
  })
})
