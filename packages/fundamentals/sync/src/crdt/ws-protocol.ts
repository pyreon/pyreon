// Minimal binary wire protocol shared by the WebSocket transport client
// (`connectViaWebSocket`) and the relay server (`createSyncServer`). One leading
// type byte + a Yjs payload (a state vector or an update), so a frame is a flat
// `Uint8Array` — no JSON, no base64.

/** "Here is my state vector — send me whatever I'm missing." */
export const MSG_STATE_VECTOR = 0
/** "Here is an update (a diff, or a live edit)." */
export const MSG_UPDATE = 1

/**
 * Frame a sync message: `[type, ...payload]`. Returns a fresh `ArrayBuffer`-backed
 * `Uint8Array` (`Uint8Array<ArrayBuffer>`) so it satisfies `WebSocket.send`'s
 * `BufferSource` parameter under TS's generic typed-array types.
 */
export function encodeSyncMessage(type: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(payload.length + 1)
  out[0] = type
  out.set(payload, 1)
  return out
}

/** Parse a framed sync message into its type + payload (zero-copy payload view). */
export function decodeSyncMessage(bytes: Uint8Array): { type: number; payload: Uint8Array } {
  return { type: bytes[0]!, payload: bytes.subarray(1) }
}

/** Normalize a WS `message` event's data (Blob / ArrayBuffer / Buffer / Uint8Array) to a Uint8Array. */
export async function toBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  // Browser Blob (some WS impls deliver Blob unless binaryType='arraybuffer').
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  // Node `ws` may deliver a Buffer (which IS a Uint8Array subclass — handled
  // above) or an array of Buffers for fragmented frames.
  if (Array.isArray(data)) {
    const parts = data.map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d as ArrayBuffer)))
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
      out.set(p, off)
      off += p.length
    }
    return out
  }
  return new Uint8Array(0)
}
