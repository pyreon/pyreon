import { base64url } from './pkce'
import { timingSafeEqual } from './oidc'
import { decodeCbor } from './cbor'
import type { Cbor } from './cbor'
import type { Jwk } from './jwt'

/** WebAuthn registration for ES256 passkeys with `none` attestation (what passkey providers send by default). */

export interface RegistrationInput {
  /** base64url attestationObject */
  attestationObject: string
  /** base64url clientDataJSON */
  clientDataJSON: string
}

export interface RegistrationExpectations {
  challenge: string
  origin: string
  rpId: string
  requireUserVerification?: boolean
  /**
   * Accept a ceremony run inside a cross-origin iframe (`clientData.crossOrigin`).
   * Default false: an RP that did not plan to be embedded must not accept one.
   */
  allowCrossOrigin?: boolean
}

export type RegistrationResult =
  | { ok: true; credentialId: string; publicKey: Jwk; signCount: number }
  | { ok: false; reason: string }

const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export async function verifyRegistration(r: RegistrationInput, e: RegistrationExpectations): Promise<RegistrationResult> {
  const no = (reason: string): RegistrationResult => ({ ok: false, reason })
  try {
    const client = JSON.parse(new TextDecoder().decode(unb64(r.clientDataJSON))) as { type?: string; challenge?: string; origin?: string; crossOrigin?: unknown }
    if (client.type !== 'webauthn.create') return no('wrong ceremony type')
    if (!timingSafeEqual(client.challenge ?? '', e.challenge)) return no('challenge mismatch')
    if (client.origin !== e.origin) return no('origin mismatch')
    if (client.crossOrigin === true && !e.allowCrossOrigin) return no('cross-origin ceremony')

    const top = decodeCbor(unb64(r.attestationObject)).value
    if (!(top instanceof Map)) return no('malformed attestation')
    if (top.get('fmt') !== 'none') return no(`unsupported attestation format "${String(top.get('fmt'))}"`)
    const auth = top.get('authData')
    if (!(auth instanceof Uint8Array) || auth.length < 55) return no('authData too short')

    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e.rpId)))
    if (!timingSafeEqual(base64url(auth.slice(0, 32)), base64url(rpHash))) return no('rpId hash mismatch')
    const flags = auth[32]!
    if (!(flags & 0x01)) return no('user presence missing')
    if ((e.requireUserVerification ?? true) && !(flags & 0x04)) return no('user verification missing')
    if (!(flags & 0x40)) return no('no attested credential data')

    const signCount = new DataView(auth.buffer, auth.byteOffset + 33, 4).getUint32(0)
    const idLen = (auth[53]! << 8) | auth[54]!
    if (idLen < 16 || idLen > 1023 || auth.length < 55 + idLen) return no('bad credential id length')
    const credentialId = base64url(auth.slice(55, 55 + idLen))
    const cose = decodeCbor(auth.slice(55 + idLen)).value as Cbor
    if (!(cose instanceof Map)) return no('malformed COSE key')
    const x = cose.get(-2)
    const y = cose.get(-3)
    if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) return no('only ES256 (P-256) passkeys are supported')
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) return no('bad EC coordinates')
    const publicKey: Jwk = { kty: 'EC', crv: 'P-256', x: base64url(x), y: base64url(y), alg: 'ES256', use: 'sig' }
    // Reject points not on the curve (importKey validates).
    await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return { ok: true, credentialId, publicKey, signCount }
  } catch {
    return no('malformed registration')
  }
}
