import { describe, expect, it } from 'vitest'
import { createNativeSyncHost } from '../crdt/native-bridge'
import type { WebSocketCtor, WebSocketLike } from '../crdt/pyreon-sync-transport'

describe('native sync bridge (JS side of the native host contract)', () => {
  it('observe seeds current value then fires on change; set writes', () => {
    const host = createNativeSyncHost({ actor: 'device-1' }) // local-only (no url)
    const seen: unknown[] = []
    const off = host.observe('doc', 'title', (v) => seen.push(v))
    expect(seen).toEqual([undefined]) // seeded immediately
    host.set('doc', 'title', 'Hello')
    expect(seen).toEqual([undefined, 'Hello'])
    expect(host.has('doc', 'title')).toBe(true)
    off()
    host.set('doc', 'title', 'After') // no more callbacks after unsubscribe
    expect(seen).toEqual([undefined, 'Hello'])
    host.destroy()
  })

  it('two observers over one map share the dispatcher — unsubscribing one leaves the other live', () => {
    // The host routes per-key observation through observeMapKey (one engine
    // observer per map). The risk this locks: one unsubscribe must remove only
    // ITS handler, never the shared observer under the sibling.
    const host = createNativeSyncHost({ actor: 'device-3' })
    const k1Seen: unknown[] = []
    const k2Seen: unknown[] = []
    const off1 = host.observe('doc', 'k1', (v) => k1Seen.push(v))
    const off2 = host.observe('doc', 'k2', (v) => k2Seen.push(v))

    off1()
    host.set('doc', 'k2', 5)
    expect(k2Seen).toEqual([undefined, 5]) // sibling still observed after off1
    host.set('doc', 'k1', 1)
    expect(k1Seen).toEqual([undefined]) // unsubscribed key stays silent

    off2()
    host.destroy()
  })

  it('with a url: opens a transport and destroy() tears it down', () => {
    // The native host injects the platform socket (bridged PyreonWebSocket);
    // this fake stands in for it so the `url !== undefined` branch is exercised.
    let closed = false
    const FakeWS: WebSocketCtor = class implements WebSocketLike {
      onmessage: ((ev: { data?: unknown }) => void) | null = null
      onopen: (() => void) | null = null
      constructor(public url: string) {}
      send(): void {}
      close(): void {
        closed = true
      }
    }
    const host = createNativeSyncHost({ actor: 'device-2', url: 'ws://relay', WebSocketImpl: FakeWS })
    host.set('doc', 'k', 'v') // engine still works locally with a transport attached
    expect(host.has('doc', 'k')).toBe(true)
    host.destroy()
    expect(closed).toBe(true) // transport.disconnect() → ws.close()
  })
})
