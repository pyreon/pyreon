// @vitest-environment node
//
// Regression lock for the WS transport's inbound SYNC fast path: with
// `binaryType = 'arraybuffer'` every frame arrives as an ArrayBuffer (or a
// Buffer under Node `ws`), so the handler must decode + apply it BEFORE
// `onmessage` returns — no per-frame promise + microtask hop. Blob frames
// (impls that ignore binaryType) must keep the async normalization.
//
// A real socket can't distinguish "applied synchronously inside onmessage"
// from "applied a microtask later" (the event dispatch is already async), so
// this file drives the handler DIRECTLY through a manual fake WebSocket: fire
// `onmessage` by hand, assert doc state on the very next statement.
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { MSG_STATE_VECTOR, MSG_UPDATE, encodeSyncMessage } from '../crdt/ws-protocol'

/** Minimal manual WebSocket: the test fires the handlers itself. */
class ManualWS {
  static last: ManualWS
  url: string
  binaryType = ''
  readyState = 1 // OPEN
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    ManualWS.last = this
  }
  send(data: unknown): void {
    this.sent.push(data)
  }
  close(): void {
    this.readyState = 3
  }
}

/** An update frame carrying `text` inserted into the 'body' Y.Text, as an ArrayBuffer. */
function updateFrame(text: string): Uint8Array<ArrayBuffer> {
  const src = new Y.Doc()
  src.getText('body').insert(0, text)
  const frame = encodeSyncMessage(MSG_UPDATE, Y.encodeStateAsUpdate(src))
  src.destroy()
  return frame
}

function connect(doc: ReturnType<typeof createYjsDoc>) {
  const transport = connectViaWebSocket(doc, 'ws://manual.invalid', {
    reconnect: false,
    WebSocketImpl: ManualWS as unknown as new (url: string) => WebSocket,
  })
  const sock = ManualWS.last
  sock.onopen?.() // completes the open handshake (SV send + arm first-sync)
  return { transport, sock }
}

describe('connectViaWebSocket — inbound frame delivery', () => {
  it('sets binaryType=arraybuffer (the precondition the fast path rests on)', () => {
    const doc = createYjsDoc()
    const { transport, sock } = connect(doc)
    expect(sock.binaryType).toBe('arraybuffer')
    transport.disconnect()
  })

  it('applies an ArrayBuffer update frame SYNCHRONOUSLY (before onmessage returns)', () => {
    const doc = createYjsDoc()
    const { transport, sock } = connect(doc)
    sock.onmessage?.({ data: updateFrame('hello').buffer })
    // NO await between the dispatch and this assertion — the fast path's contract.
    expect(doc.yDoc.getText('body').toString()).toBe('hello')
    // The first inbound update is the sync-round-trip marker, also synchronous.
    expect(transport.synced()).toBe(true)
    transport.disconnect()
  })

  it('applies a Buffer frame (Node `ws` shape, a Uint8Array subclass) synchronously', () => {
    const doc = createYjsDoc()
    const { transport, sock } = connect(doc)
    const frame = updateFrame('from-node-ws')
    sock.onmessage?.({ data: Buffer.from(frame) })
    expect(doc.yDoc.getText('body').toString()).toBe('from-node-ws')
    transport.disconnect()
  })

  it('answers an inbound state vector synchronously with an update frame', () => {
    const doc = createYjsDoc()
    doc.yDoc.getText('body').insert(0, 'mine')
    const { transport, sock } = connect(doc)
    const sentBefore = sock.sent.length
    const sv = encodeSyncMessage(MSG_STATE_VECTOR, Y.encodeStateVector(new Y.Doc()))
    sock.onmessage?.({ data: sv.buffer })
    expect(sock.sent.length).toBe(sentBefore + 1)
    const reply = sock.sent[sock.sent.length - 1] as Uint8Array
    expect(reply[0]).toBe(MSG_UPDATE)
    transport.disconnect()
  })

  it('a Blob frame takes the ASYNC path: not applied synchronously, applied after the read', async () => {
    const doc = createYjsDoc()
    const { transport, sock } = connect(doc)
    const frame = updateFrame('via-blob')
    sock.onmessage?.({ data: new Blob([frame]) })
    // The Blob read is genuinely async — nothing may have landed yet.
    expect(doc.yDoc.getText('body').toString()).toBe('')
    await vi.waitFor(() => {
      expect(doc.yDoc.getText('body').toString()).toBe('via-blob')
    })
    expect(transport.synced()).toBe(true)
    transport.disconnect()
  })

  it('drops a malformed sync-path frame without throwing into the event dispatcher', () => {
    const doc = createYjsDoc()
    const { transport, sock } = connect(doc)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Garbage bytes typed as an update — Yjs throws, the handler must swallow.
    expect(() => sock.onmessage?.({ data: new Uint8Array([MSG_UPDATE, 99, 99, 99]).buffer }))
      .not.toThrow()
    expect(warn).toHaveBeenCalledWith(
      '[Pyreon] connectViaWebSocket: dropped a malformed frame from the relay:',
      expect.anything(),
    )
    warn.mockRestore()
    transport.disconnect()
  })
})
