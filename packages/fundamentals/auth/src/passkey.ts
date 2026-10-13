import { base64url, randomToken } from './pkce'
import { timingSafeEqual } from './oidc'
import type { Jwk } from './jwt'

/** WebAuthn assertion (sign-in) verification — ES256 passkeys. Registration/attestation is a later phase. */

export interface AssertionInput {
  /** base64url of authenticatorData */
  authenticatorData: string
  /** base64url of clientDataJSON */
  clientDataJSON: string
  /** base64url of the DER-encoded ECDSA signature */
  signature: string
}

export interface AssertionExpectations {
  /** The challenge you issued (single use, from `passkeyChallenge()`). */
  challenge: string
  /** e.g. `https://app.example` — must match exactly. */
  origin: string
  /** Relying-party id, e.g. `app.example`. */
  rpId: string
  /** The credential's stored public key (P-256 JWK). */
  publicKey: Jwk
  /** Last accepted signCount; a non-increasing counter signals a cloned authenticator. */
  signCount?: number
  /** Require user verification (biometric/PIN). Default true. */
  requireUserVerification?: boolean
}

export type AssertionResult = { ok: true; signCount: number } | { ok: false; reason: string }

export const passkeyChallenge = (): string => randomToken(32)

const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

/** DER ECDSA signature -> raw r||s (64 bytes) as WebCrypto expects. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('[Pyreon] auth: bad DER signature')
  let o = 2 + (der[1]! & 0x80 ? der[1]! & 0x7f : 0)
  const read = () => {
    if (der[o] !== 0x02) throw new Error('[Pyreon] auth: bad DER signature')
    const len = der[o + 1]!
    let v = der.slice(o + 2, o + 2 + len)
    o += 2 + len
    while (v.length > 32 && v[0] === 0) v = v.slice(1)
    if (v.length > 32) throw new Error('[Pyreon] auth: bad DER signature')
    const out = new Uint8Array(32)
    out.set(v, 32 - v.length)
    return out
  }
  const r = read()
  const s = read()
  const raw = new Uint8Array(64)
  raw.set(r, 0)
  raw.set(s, 32)
  return raw
}

export async function verifyAssertion(a: AssertionInput, e: AssertionExpectations): Promise<AssertionResult> {
  const no = (reason: string): AssertionResult => ({ ok: false, reason })
  try {
    const clientDataBytes = unb64(a.clientDataJSON)
    const client = JSON.parse(new TextDecoder().decode(clientDataBytes)) as { type?: string; challenge?: string; origin?: string }
    if (client.type !== 'webauthn.get') return no('wrong ceremony type')
    if (!timingSafeEqual(client.challenge ?? '', e.challenge)) return no('challenge mismatch')
    if (client.origin !== e.origin) return no('origin mismatch')

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
    const key = await crypto.subtle.importKey('jwk', e.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(unb64(a.signature)), signed)
    return ok ? { ok: true, signCount } : no('bad signature')
  } catch {
    return no('malformed assertion')
  }
}
