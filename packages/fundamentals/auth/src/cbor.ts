/** Minimal CBOR decoder (RFC 8949) — just the subset WebAuthn attestation objects and COSE keys use. */
export type Cbor = number | bigint | string | Uint8Array | Cbor[] | Map<Cbor, Cbor> | boolean | null

export function decodeCbor(bytes: Uint8Array): { value: Cbor; end: number } {
  let o = 0
  const need = (n: number) => {
    if (o + n > bytes.length) throw new Error('cbor: truncated')
  }
  const uint = (info: number): number => {
    if (info < 24) return info
    const n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 0
    if (!n) throw new Error('cbor: unsupported length')
    need(n)
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + bytes[o++]!
    return v
  }
  const item = (depth: number): Cbor => {
    if (depth > 8) throw new Error('cbor: too deep')
    need(1)
    const b = bytes[o++]!
    const major = b >> 5
    const info = b & 31
    if (major === 0) return uint(info)
    if (major === 1) return -1 - uint(info)
    if (major === 2 || major === 3) {
      const len = uint(info)
      need(len)
      const s = bytes.slice(o, o + len)
      o += len
      return major === 2 ? s : new TextDecoder().decode(s)
    }
    if (major === 4) {
      const n = uint(info)
      if (n > 1024) throw new Error('cbor: too large')
      const a: Cbor[] = []
      for (let i = 0; i < n; i++) a.push(item(depth + 1))
      return a
    }
    if (major === 5) {
      const n = uint(info)
      if (n > 1024) throw new Error('cbor: too large')
      const m = new Map<Cbor, Cbor>()
      for (let i = 0; i < n; i++) m.set(item(depth + 1), item(depth + 1))
      return m
    }
    if (major === 7) {
      if (info === 20) return false
      if (info === 21) return true
      if (info === 22) return null
    }
    throw new Error('cbor: unsupported item')
  }
  const value = item(0)
  return { value, end: o }
}
