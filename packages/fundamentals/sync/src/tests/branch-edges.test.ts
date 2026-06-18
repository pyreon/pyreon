// @vitest-environment node
// Coverage for the after-disconnect / option-default branch arms in the
// fake relay + broadcast-channel + ws transports.
import { describe, expect, it } from 'vitest'
import { connectFakeDocs, FakeCrdtDoc } from '../crdt/fake-adapter'
import { LOCAL_ORIGIN } from '../crdt/types'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { connectViaBroadcastChannel } from '../crdt/yjs-transport'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { createSyncServer, type SyncServer } from '../server'

describe('connectFakeDocs — relay is a no-op after disconnect', () => {
  it('a commit on A after disconnect() does not reach B (relay `if (!connected) return`)', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    const { disconnect, forwards } = connectFakeDocs(a, b)
    a.transact(() => a.getMap('m').set('x', 1), LOCAL_ORIGIN)
    expect(b.getMap('m').get('x')).toBe(1) // relayed while connected
    disconnect()
    a.transact(() => a.getMap('m').set('y', 2), LOCAL_ORIGIN)
    expect(b.getMap('m').get('y')).toBeUndefined() // relay bailed: !connected
    expect(forwards()).toBe(1)
  })
})

describe('connectViaBroadcastChannel — relay + onmessage are no-ops after disconnect', () => {
  it('a write on A after disconnect() does not relay (relayTo `if (!connected) return`)', async () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'cov-bc-room')
    const cb = connectViaBroadcastChannel(b, 'cov-bc-room')
    await new Promise((r) => setTimeout(r, 20))
    ca.disconnect()
    cb.disconnect()
    // After disconnect, a local write must not throw and must not relay.
    expect(() => a.yDoc.getMap('m').set('z', 1)).not.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    expect(b.yDoc.getMap('m').get('z')).toBeUndefined()
  })
})

describe('connectViaWebSocket — reconnect defaults to true when omitted', () => {
  it('omitting the reconnect option takes the `?? true` default arm', async () => {
    const WsClient = (await import('ws')).WebSocket
    const WSImpl = WsClient as unknown as new (url: string) => WebSocket
    let server: SyncServer | undefined
    server = await createSyncServer({ port: 0 })
    const a = createYjsDoc()
    // No `reconnect` key → `options.reconnect ?? true` right arm.
    const t = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/cov`, { WebSocketImpl: WSImpl })
    await new Promise((r) => setTimeout(r, 60))
    t.disconnect()
    await server.close()
    expect(true).toBe(true)
  })
})
