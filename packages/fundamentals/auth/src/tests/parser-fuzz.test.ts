/**
 * Seeded fuzz of the hand-written parsers that take attacker-controlled bytes:
 * the CBOR reader (WebAuthn attestation objects / COSE keys), the DER signature
 * reader, and the two passkey verifiers built on them.
 *
 * Contract under test: for ANY input, each parser either returns a value or
 * throws a `[Pyreon]`-prefixed Error — never a RangeError/TypeError from an
 * out-of-bounds read, never a hang, never unbounded allocation — and the
 * verifiers never throw at all (they return `{ ok: false }`).
 *
 * Inputs are both random byte strings and MUTATIONS of valid structures (the
 * interesting bugs live one byte away from a valid input).
 */
import { describe, expect, it } from 'vitest'
import { decodeCbor } from '../cbor'
import { base64url, derToRaw, verifyAssertion, verifyRegistration } from '../index'

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEEDS = Math.max(1, Number((process.env as Record<string, string | undefined>).PYREON_FUZZ_SEEDS) || 3000)

function mutate(r: () => number, base: Uint8Array): Uint8Array {
  const out = Array.from(base)
  const n = 1 + Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const op = r()
    const at = Math.floor(r() * (out.length + 1))
    if (op < 0.4 && out.length > 0) out[at % out.length] = Math.floor(r() * 256)
    else if (op < 0.6) out.splice(at, 0, Math.floor(r() * 256))
    else if (op < 0.8 && out.length > 0) out.splice(at % out.length, 1)
    else out.length = Math.floor(r() * out.length) // truncate
  }
  return Uint8Array.from(out)
}

function randomBytes(r: () => number, max: number): Uint8Array {
  return Uint8Array.from({ length: Math.floor(r() * max) }, () => Math.floor(r() * 256))
}

/** A valid-shaped CBOR attestation object: {fmt:"none", attStmt:{}, authData:bytes(64)}. */
const VALID_CBOR = Uint8Array.from([
  0xa3, 0x63, 0x66, 0x6d, 0x74, 0x64, 0x6e, 0x6f, 0x6e, 0x65, 0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, 0xa0,
  0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, 0x58, 0x40, ...new Array(64).fill(7),
])
/** A valid DER ECDSA signature shape: SEQUENCE { INTEGER(32), INTEGER(33 with leading 0) }. */
const VALID_DER = Uint8Array.from([0x30, 0x45, 0x02, 0x20, ...new Array(32).fill(1), 0x02, 0x21, 0x00, ...new Array(32).fill(0x81)])

function expectContained(f: () => unknown, label: string): void {
  try {
    f()
  } catch (e) {
    expect(e instanceof Error && e.message.startsWith('[Pyreon]'), `${label}: ${String(e)}`).toBe(true)
  }
}

describe('parser fuzz', () => {
  it(`decodeCbor: ${SEEDS} random + mutated inputs only ever return or throw a [Pyreon] error`, () => {
    for (let s = 1; s <= SEEDS; s++) {
      const r = rng(s)
      const input = r() < 0.5 ? randomBytes(r, 96) : mutate(r, VALID_CBOR)
      expectContained(() => {
        const { end } = decodeCbor(input)
        // A successful decode can never have consumed more bytes than exist —
        // a missing bounds check shows up here, not as a crash (slice() clamps).
        expect(end, `seed ${s}: end past input`).toBeLessThanOrEqual(input.length)
      }, `seed ${s}`)
    }
  })

  it('decodeCbor refuses length prefixes larger than the input without allocating them', () => {
    // byte string claiming 2^32-1 bytes; map/array claiming 2^32-1 entries
    for (const b of [[0x5a, 0xff, 0xff, 0xff, 0xff], [0x9a, 0xff, 0xff, 0xff, 0xff], [0xba, 0xff, 0xff, 0xff, 0xff]]) {
      expectContained(() => decodeCbor(Uint8Array.from(b)), JSON.stringify(b))
    }
    // deep nesting
    expectContained(() => decodeCbor(new Uint8Array(10_000).fill(0x81)), 'deep arrays')
    // more than 1024 entries is refused outright, even when every entry is present
    const big = Uint8Array.from([0x99, 0x04, 0x01, ...new Array(1025).fill(0x00)])
    expect(() => decodeCbor(big)).toThrow('[Pyreon] auth: cbor: too large')
  })

  it(`derToRaw: ${SEEDS} random + mutated inputs only ever return 64 bytes or throw a [Pyreon] error`, () => {
    for (let s = 1; s <= SEEDS; s++) {
      const r = rng(s)
      const input = r() < 0.5 ? randomBytes(r, 80) : mutate(r, VALID_DER)
      try {
        const out = derToRaw(input)
        expect(out.length, `seed ${s}`).toBe(64)
      } catch (e) {
        expect(e instanceof Error && e.message.startsWith('[Pyreon]'), `seed ${s}: ${String(e)}`).toBe(true)
      }
    }
  })

  it(`verifyRegistration / verifyAssertion never throw on ${Math.min(SEEDS, 1000)} garbage inputs`, async () => {
    const n = Math.min(SEEDS, 1000)
    const jwk = { kty: 'EC', crv: 'P-256', x: base64url(new Uint8Array(32).fill(1)), y: base64url(new Uint8Array(32).fill(2)) }
    for (let s = 1; s <= n; s++) {
      const r = rng(s)
      const clientDataJSON = base64url(
        r() < 0.5
          ? randomBytes(r, 64)
          : new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: 'c', origin: 'https://a.example' })),
      )
      const reg = await verifyRegistration(
        { attestationObject: base64url(mutate(r, VALID_CBOR)), clientDataJSON },
        { challenge: 'c', origin: 'https://a.example', rpId: 'a.example' },
      )
      expect(reg.ok, `reg seed ${s}`).toBe(false)
      const as = await verifyAssertion(
        { authenticatorData: base64url(randomBytes(r, 64)), clientDataJSON, signature: base64url(mutate(r, VALID_DER)) },
        { challenge: 'c', origin: 'https://a.example', rpId: 'a.example', publicKey: jwk },
      )
      expect(as.ok, `assert seed ${s}`).toBe(false)
    }
  })
})
