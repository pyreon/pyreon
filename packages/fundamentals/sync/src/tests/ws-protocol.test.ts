// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MSG_STATE_VECTOR,
  MSG_UPDATE,
  decodeSyncMessage,
  encodeSyncMessage,
  toBytes,
} from '../crdt/ws-protocol'

describe('ws-protocol — frame encode/decode', () => {
  it('round-trips a state-vector frame', () => {
    const frame = encodeSyncMessage(MSG_STATE_VECTOR, new Uint8Array([10, 20, 30]))
    expect(frame[0]).toBe(MSG_STATE_VECTOR)
    const { type, payload } = decodeSyncMessage(frame)
    expect(type).toBe(MSG_STATE_VECTOR)
    expect([...payload]).toEqual([10, 20, 30])
  })

  it('round-trips an update frame', () => {
    const frame = encodeSyncMessage(MSG_UPDATE, new Uint8Array([1, 2, 3, 4]))
    const { type, payload } = decodeSyncMessage(frame)
    expect(type).toBe(MSG_UPDATE)
    expect([...payload]).toEqual([1, 2, 3, 4])
  })

  it('handles an empty payload (type byte only)', () => {
    const frame = encodeSyncMessage(MSG_UPDATE, new Uint8Array(0))
    expect(frame.length).toBe(1)
    const { type, payload } = decodeSyncMessage(frame)
    expect(type).toBe(MSG_UPDATE)
    expect(payload.length).toBe(0)
  })

  it('returns an ArrayBuffer-backed Uint8Array (satisfies WebSocket.send BufferSource)', () => {
    const frame = encodeSyncMessage(MSG_UPDATE, new Uint8Array([9]))
    expect(frame.buffer).toBeInstanceOf(ArrayBuffer)
  })
})

describe('ws-protocol — toBytes (normalizes every WS data shape)', () => {
  it('passes a Uint8Array through unchanged (zero-copy)', async () => {
    const u = new Uint8Array([1, 2, 3])
    expect(await toBytes(u)).toBe(u)
  })

  it('wraps an ArrayBuffer', async () => {
    const ab = new Uint8Array([4, 5, 6]).buffer
    expect([...(await toBytes(ab))]).toEqual([4, 5, 6])
  })

  it('reads a Blob (browser binaryType fallback)', async () => {
    const blob = new Blob([new Uint8Array([7, 8, 9])])
    expect([...(await toBytes(blob))]).toEqual([7, 8, 9])
  })

  it('concatenates a Buffer[] (Node `ws` fragmented frame)', async () => {
    const parts = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]
    expect([...(await toBytes(parts))]).toEqual([1, 2, 3, 4, 5])
  })

  it('wraps ArrayBuffer entries inside a fragmented array', async () => {
    const parts = [new Uint8Array([1]).buffer, new Uint8Array([2, 3])]
    expect([...(await toBytes(parts))]).toEqual([1, 2, 3])
  })

  it('returns empty for an unknown shape (dropped by the caller)', async () => {
    expect((await toBytes(12345 as unknown)).length).toBe(0)
    expect((await toBytes(null)).length).toBe(0)
    expect((await toBytes(undefined)).length).toBe(0)
  })
})
