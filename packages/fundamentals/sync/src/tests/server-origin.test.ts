// @vitest-environment node
// Cross-site WebSocket hijacking guard on the relay, against a REAL `ws` relay
// and the `ws` client (which, unlike a browser, lets a spec set `Origin`).
//
// WebSockets are not subject to CORS: a page on ANY site can open the relay
// and the browser attaches the relay domain's cookies. `authorize`'s docs
// invite cookie auth, so an upgrade from a foreign origin must be refused
// before `authorize` sees it — or a cookie-authorized room is readable and
// writable from every site its users visit.
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { type AuthorizeContext, type SyncServer, createSyncServer } from '../server'
import { waitFor } from './ws-wait'

/** Outcome of one upgrade: the close code, or `'joined'` when the relay sent document state. */
async function attempt(url: string, headers: Record<string, string>): Promise<number | 'joined'> {
  const sock = new WsClient(url, { headers })
  let outcome: number | 'joined' | null = null
  sock.on('message', () => {
    outcome ??= 'joined'
    sock.close()
  })
  sock.on('close', (code) => {
    outcome ??= code
  })
  sock.on('error', () => {})
  await waitFor('the upgrade to settle', () => outcome !== null, {
    describe: () => `readyState=${sock.readyState}`,
  })
  return outcome as unknown as number | 'joined'
}

describe('sync relay — Origin check on the upgrade', () => {
  let server: SyncServer | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  const cookieAuth = (seen: AuthorizeContext[]) => (ctx: AuthorizeContext) => {
    seen.push(ctx)
    return (ctx.req.headers.cookie ?? '').includes('session=valid')
  }

  it('closes a cross-origin browser upgrade with 4403 BEFORE authorize runs', async () => {
    const seen: AuthorizeContext[] = []
    server = await createSyncServer({ host: '127.0.0.1', port: 0, heartbeatIntervalMs: 0, authorize: cookieAuth(seen) })
    const url = `ws://127.0.0.1:${server.port}/private-room`
    expect(await attempt(url, { Origin: 'https://evil.invalid', Cookie: 'session=valid' })).toBe(4403)
    expect(await attempt(url, { Origin: 'null', Cookie: 'session=valid' })).toBe(4403)
    expect(seen).toEqual([])
  })

  it('admits same-origin pages and non-browser clients, and passes `origin` to authorize', async () => {
    const seen: AuthorizeContext[] = []
    server = await createSyncServer({ host: '127.0.0.1', port: 0, heartbeatIntervalMs: 0, authorize: cookieAuth(seen) })
    const url = `ws://127.0.0.1:${server.port}/private-room`
    // Same origin: the page was served by this host.
    expect(await attempt(url, { Origin: `http://127.0.0.1:${server.port}`, Cookie: 'session=valid' })).toBe('joined')
    // No Origin header: Node / Bun / native — not a browser page.
    expect(await attempt(url, { Cookie: 'session=valid' })).toBe('joined')
    expect(seen.map((c) => c.origin)).toEqual([`http://127.0.0.1:${server.port}`, null])
  })

  it('admits an origin listed in allowedOrigins (normalized), and a predicate', async () => {
    server = await createSyncServer({
      host: '127.0.0.1',
      port: 0,
      heartbeatIntervalMs: 0,
      allowedOrigins: ['https://App.example.com:443'],
      authorize: () => true,
    })
    const url = `ws://127.0.0.1:${server.port}/r`
    expect(await attempt(url, { Origin: 'https://app.example.com' })).toBe('joined')
    expect(await attempt(url, { Origin: 'https://other.example.com' })).toBe(4403)
    await server.close()

    server = await createSyncServer({
      host: '127.0.0.1',
      port: 0,
      heartbeatIntervalMs: 0,
      allowedOrigins: (o) => o.endsWith('.example.com'),
      authorize: () => true,
    })
    const url2 = `ws://127.0.0.1:${server.port}/r`
    expect(await attempt(url2, { Origin: 'https://b.example.com' })).toBe('joined')
    expect(await attempt(url2, { Origin: 'https://example.org' })).toBe(4403)
  })
})
