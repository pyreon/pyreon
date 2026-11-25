import { base64url, decodeBase64url, randomToken } from './pkce'
import { timingSafeEqual } from './oidc'
import type { Jwk } from './jwt'

/** WebAuthn assertion (sign-in) verification — ES256 and RS256 passkeys (the key type decides). */

export interface AssertionInput {
  /** base64url of authenticatorData */
  authenticatorData: string
  /** base64url of clientDataJSON */
  clientDataJSON: string
  /** base64url signature: DER-encoded ECDSA for ES256, raw PKCS#1 v1.5 for RS256 */
  signature: string
}

export interface AssertionExpectations {
  /** The challenge you issued (single use, from `passkeyChallenge()`). */
  challenge: string
  /** e.g. `https://app.example` — must match exactly. */
  origin: string
  /** Relying-party id, e.g. `app.example`. */
  rpId: string
  /** The credential's stored public key, as returned by `verifyRegistration` (P-256 or RSA JWK). */
  publicKey: Jwk
  /** Last accepted signCount; a non-increasing counter signals a cloned authenticator. */
  signCount?: number | undefined
  /** Require user verification (biometric/PIN). Default true. */
  requireUserVerification?: boolean
  /**
   * Accept a ceremony run inside a cross-origin iframe (`clientData.crossOrigin`).
   * Default false: an RP that did not plan to be embedded must not accept one.
   */
  allowCrossOrigin?: boolean
}

export type AssertionResult = { ok: true; signCount: number } | { ok: false; reason: string }

export const passkeyChallenge = (): string => randomToken(32)

const unb64 = decodeBase64url

/**
 * Strict DER ECDSA-P256 signature -> raw r||s (64 bytes) as WebCrypto expects. Only the one
 * canonical encoding is accepted (X.690 DER): a SEQUENCE whose short-form length covers exactly
 * the rest of the input, two INTEGERs in minimal form (a leading zero only before a high bit),
 * positive, non-zero and at most 32 bytes of value, and nothing after them. A lenient parser lets
 * one signature be spelled many ways (signature malleability).
 */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  const fail = (): never => {
    throw new Error('[Pyreon] auth: bad DER signature')
  }
  // 30 len 02 l r 02 l s: at least 8 bytes; a P-256 signature is at most 72, so the length
  // is always short form.
  if (der.length < 8 || der[0] !== 0x30 || der[1]! & 0x80 || der[1] !== der.length - 2) fail()
  let o = 2
  const read = (): Uint8Array => {
    if (der[o] !== 0x02) fail()
    const len = der[o + 1]
    if (len === undefined || len === 0 || len & 0x80 || o + 2 + len > der.length) fail()
    const v = der.subarray(o + 2, o + 2 + len!)
    o += 2 + len!
    if (v[0]! & 0x80) fail() // negative
    if (v[0] === 0 && (v.length === 1 || !(v[1]! & 0x80))) fail() // non-minimal, or zero
    const value = v[0] === 0 ? v.subarray(1) : v
    if (value.length > 32) fail()
    const out = new Uint8Array(32)
    out.set(value, 32 - value.length)
    return out
  }
  const r = read()
  const s = read()
  if (o !== der.length) fail()
  const raw = new Uint8Array(64)
  raw.set(r, 0)
  raw.set(s, 32)
  return raw
}

// WebCrypto refuses an RSA JWK whose `alg` disagrees with the import algorithm;
// pin it rather than trust whatever was stored.
const rsaJwk = (k: Jwk): Jwk => ({ kty: 'RSA', n: k.n, e: k.e, alg: 'RS256' }) as Jwk

export async function verifyAssertion(a: AssertionInput, e: AssertionExpectations): Promise<AssertionResult> {
  const no = (reason: string): AssertionResult => ({ ok: false, reason })
  try {
    const clientDataBytes = unb64(a.clientDataJSON)
    const client = JSON.parse(new TextDecoder().decode(clientDataBytes)) as { type?: string; challenge?: string; origin?: string; crossOrigin?: unknown }
    if (client.type !== 'webauthn.get') return no('wrong ceremony type')
    if (!timingSafeEqual(client.challenge ?? '', e.challenge)) return no('challenge mismatch')
    if (client.origin !== e.origin) return no('origin mismatch')
    if (client.crossOrigin === true && !e.allowCrossOrigin) return no('cross-origin ceremony')

    const auth = unb64(a.authenticatorData)
    if (auth.length < 37) return no('authenticatorData too short')
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e.rpId)))
    if (!timingSafeEqual(base64url(auth.slice(0, 32)), base64url(rpHash))) return no('rpId hash mismatch')
    const flags = auth[32]!
    if (!(flags & 0x01)) return no('user presence missing')
    if ((e.requireUserVerification ?? true) && !(flags & 0x04)) return no('user verification missing')
    const signCount = new DataView(auth.buffer, auth.byteOffset + 33, 4).getUint32(0)
    const prev = e.signCount ?? 0
    if ((signCount !== 0 || prev !== 0) && signCount <= prev) return no('signCount did not increase (cloned authenticator?)')

    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes))
    const signed = new Uint8Array(auth.length + 32)
    signed.set(auth, 0)
    signed.set(hash, auth.length)
    let ok: boolean
    // The stored key's type picks the algorithm — never the assertion, which the
    // client controls.
    if (e.publicKey.kty === 'RSA') {
      const key = await crypto.subtle.importKey('jwk', rsaJwk(e.publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
      ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(a.signature), signed)
    } else if (e.publicKey.kty === 'EC' && e.publicKey.crv === 'P-256') {
      const key = await crypto.subtle.importKey('jwk', e.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(unb64(a.signature)), signed)
    } else {
      return no('unsupported public key type')
    }
    return ok ? { ok: true, signCount } : no('bad signature')
  } catch {
    return no('malformed assertion')
  }
}
