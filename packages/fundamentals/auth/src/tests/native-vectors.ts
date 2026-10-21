/**
 * ID-token parity vectors for the three verifiers (web, Swift, Kotlin). Driven by
 * `scripts/gen-native-vectors.ts`:
 *
 *   bun scripts/gen-native-vectors.ts          regenerate keys + tokens (new signatures)
 *   bun scripts/gen-native-vectors.ts --render rewrite the embedded copies from vectors.json
 *
 * `native/tests/vectors.json` is the source of truth and is committed: ES256 signatures
 * are randomised, so regenerating changes every token. The Swift and Kotlin tests embed
 * the same JSON between marker comments; `vectors.test.ts` asserts the embedded copies
 * are byte-for-byte what `--render` would write, and that the web verifier reaches every
 * expected verdict — so all three targets are held to one set of answers.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { base64url } from '../pkce'

export const ROOT = join(import.meta.dirname, '..', '..')
export const VECTORS = join(ROOT, 'native', 'tests', 'vectors.json')
export const SWIFT_TARGET = join(ROOT, 'native', 'tests', 'PyreonOidcVectors.swift')
export const KOTLIN_TARGET = join(ROOT, 'native', 'tests', 'PyreonOidcJoseTest.kt')
export const BEGIN = '// <gen-vectors:begin>'
export const END = '// <gen-vectors:end>'

export interface VectorCase {
  name: string
  token: string
  nonce?: string
  /** "ok" or the AuthError code every verifier must produce. */
  expect: string
}

export interface Vectors {
  issuer: string
  clientId: string
  /** Seconds since the epoch every case is verified at. */
  now: number
  keys: Record<string, unknown>[]
  cases: VectorCase[]
}

/** The JSON as embedded in the native tests: one line, no `$` (Kotlin raw strings interpolate it). */
export function embedded(v: Vectors): string {
  const json = JSON.stringify(v)
  if (json.includes('$') || json.includes('"#')) throw new Error('[Pyreon] vectors must not contain $ or "#')
  return json
}

export function renderSwift(v: Vectors): string {
  return `${BEGIN}\nlet pyreonOidcVectors = #"${embedded(v)}"#\n${END}`
}

export function renderKotlin(v: Vectors): string {
  return `${BEGIN}\nprivate const val VECTORS = """${embedded(v)}"""\n${END}`
}

export function replaceRegion(file: string, region: string): string {
  const a = file.indexOf(BEGIN)
  const b = file.indexOf(END)
  if (a < 0 || b < a) throw new Error(`[Pyreon] no ${BEGIN} … ${END} region`)
  return file.slice(0, a) + region + file.slice(b + END.length)
}

const enc = new TextEncoder()
const b64json = (o: unknown) => base64url(enc.encode(JSON.stringify(o)))

export async function generate(): Promise<Vectors> {
  const issuer = 'https://idp.example'
  const clientId = 'app'
  const now = 1_800_000_000
  const rsa = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const ec = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pub = async (k: CryptoKey, kid: string, alg: string) => {
    const { kty, n, e, crv, x, y } = (await crypto.subtle.exportKey('jwk', k)) as JsonWebKey
    return { kty, kid, alg, use: 'sig', ...(n ? { n, e } : { crv, x, y }) }
  }
  const ecPub = await pub(ec.publicKey, 'ek', 'ES256')
  // ek2: the same EC key published with alg "" and use null — both UNSET, so it still matches.
  const keys = [await pub(rsa.publicKey, 'rk', 'RS256'), ecPub, { ...ecPub, kid: 'ek2', alg: '', use: null }]

  const sign = async (alg: 'RS256' | 'ES256', header: object, claims: object): Promise<string> => {
    const input = `${b64json(header)}.${b64json(claims)}`
    const sig =
      alg === 'RS256'
        ? await crypto.subtle.sign('RSASSA-PKCS1-v1_5', rsa.privateKey, enc.encode(input))
        : await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ec.privateKey, enc.encode(input))
    return `${input}.${base64url(new Uint8Array(sig))}`
  }
  const base = { iss: issuer, sub: 'user-1', aud: clientId, exp: now + 300, iat: now, nonce: 'n1', email: 'a@example.com' }
  const rs = (claims: object = base, header: object = { alg: 'RS256', kid: 'rk', typ: 'JWT' }) => sign('RS256', header, claims)
  const es = (claims: object = base, header: object = { alg: 'ES256', kid: 'ek', typ: 'JWT' }) => sign('ES256', header, claims)
  const without = (k: string) => Object.fromEntries(Object.entries(base).filter(([key]) => key !== k))

  const valid = await rs()
  const [h, , s] = valid.split('.') as [string, string, string]
  const cases: VectorCase[] = [
    { name: 'rs256 valid', token: valid, nonce: 'n1', expect: 'ok' },
    { name: 'es256 valid', token: await es(), nonce: 'n1', expect: 'ok' },
    { name: 'es256 without kid matches any EC key', token: await es(base, { alg: 'ES256' }), nonce: 'n1', expect: 'ok' },
    { name: 'nonce not checked when none expected', token: await rs(), expect: 'ok' },
    { name: 'exp inside the 60s skew', token: await rs({ ...base, exp: now - 30 }), nonce: 'n1', expect: 'ok' },
    { name: 'multi-audience with azp', token: await rs({ ...base, aud: [clientId, 'other'], azp: clientId }), nonce: 'n1', expect: 'ok' },
    { name: 'key with empty alg and null use is unset, so it matches', token: await es(base, { alg: 'ES256', kid: 'ek2' }), nonce: 'n1', expect: 'ok' },
    { name: 'empty-string kid selects every key', token: await es(base, { alg: 'ES256', kid: '' }), nonce: 'n1', expect: 'ok' },
    { name: 'wrong nonce', token: await rs(), nonce: 'n2', expect: 'bad_nonce' },
    { name: 'nonce that is not a string', token: await rs({ ...base, nonce: 1 }), nonce: '1', expect: 'bad_nonce' },
    { name: 'kid that is not a string matches no key', token: await rs(base, { alg: 'RS256', kid: 5 }), nonce: 'n1', expect: 'no_key' },
    // 0 is falsy: JS truthiness would read it as "no kid" and match every key. The shared rule
    // treats only absent / null / "" as unset, so this is the case that tells them apart.
    { name: 'kid 0 is not unset, so it matches no key', token: await rs(base, { alg: 'RS256', kid: 0 }), nonce: 'n1', expect: 'no_key' },
    { name: 'expired', token: await rs({ ...base, exp: now - 61 }), nonce: 'n1', expect: 'expired' },
    { name: 'exp not a number', token: await rs({ ...base, exp: String(now + 300) }), nonce: 'n1', expect: 'expired' },
    { name: 'nbf in the future', token: await rs({ ...base, nbf: now + 61 }), nonce: 'n1', expect: 'not_yet_valid' },
    { name: 'nbf not a number', token: await rs({ ...base, nbf: 'soon' }), nonce: 'n1', expect: 'not_yet_valid' },
    { name: 'wrong issuer', token: await rs({ ...base, iss: 'https://evil.example' }), nonce: 'n1', expect: 'bad_iss' },
    { name: 'wrong audience', token: await rs({ ...base, aud: 'other' }), nonce: 'n1', expect: 'bad_aud' },
    { name: 'multi-audience without azp', token: await rs({ ...base, aud: [clientId, 'other'] }), nonce: 'n1', expect: 'bad_azp' },
    { name: 'missing sub', token: await rs(without('sub')), nonce: 'n1', expect: 'bad_token' },
    { name: 'empty sub', token: await rs({ ...base, sub: '' }), nonce: 'n1', expect: 'bad_token' },
    { name: 'alg none', token: `${b64json({ alg: 'none' })}.${b64json(base)}.`, nonce: 'n1', expect: 'bad_alg' },
    { name: 'alg HS256', token: `${b64json({ alg: 'HS256', kid: 'rk' })}.${b64json(base)}.${s}`, nonce: 'n1', expect: 'bad_alg' },
    { name: 'crit header', token: await rs(base, { alg: 'RS256', kid: 'rk', crit: ['x'] }), nonce: 'n1', expect: 'bad_token' },
    { name: 'unknown kid', token: await rs(base, { alg: 'RS256', kid: 'nope' }), nonce: 'n1', expect: 'no_key' },
    { name: 'RS256 header naming the EC key', token: await rs(base, { alg: 'RS256', kid: 'ek' }), nonce: 'n1', expect: 'no_key' },
    { name: 'payload swapped under a valid signature', token: `${h}.${b64json({ ...base, sub: 'mallory' })}.${s}`, nonce: 'n1', expect: 'bad_signature' },
    { name: 'signature with padding', token: `${valid}=`, nonce: 'n1', expect: 'bad_signature' },
    { name: 'signature with a standard-alphabet char', token: `${valid.slice(0, -1)}+`, nonce: 'n1', expect: 'bad_signature' },
    { name: 'two segments', token: `${h}.${b64json(base)}`, nonce: 'n1', expect: 'bad_token' },
    { name: 'header not JSON', token: `${base64url(enc.encode('x'))}.${b64json(base)}.${s}`, nonce: 'n1', expect: 'bad_token' },
    { name: 'payload is an array', token: `${h}.${b64json([1])}.${s}`, nonce: 'n1', expect: 'bad_token' },
    { name: 'payload is not UTF-8', token: `${h}.${base64url(new Uint8Array([0x7b, 0xff, 0x7d]))}.${s}`, nonce: 'n1', expect: 'bad_token' },
    { name: 'header not base64url', token: `${h}!.${b64json(base)}.${s}`, nonce: 'n1', expect: 'bad_token' },
  ]
  return { issuer, clientId, now, keys, cases }
}

export function render(v: Vectors): void {
  writeFileSync(SWIFT_TARGET, replaceRegion(readFileSync(SWIFT_TARGET, 'utf8'), renderSwift(v)))
  writeFileSync(KOTLIN_TARGET, replaceRegion(readFileSync(KOTLIN_TARGET, 'utf8'), renderKotlin(v)))
}

