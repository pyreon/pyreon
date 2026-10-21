/**
 * Cross-target ID-token parity. `native/tests/vectors.json` is one answer sheet held by all
 * three verifiers: this file runs the web one against it, and the Swift / Kotlin smoke tests
 * (run by check-native-cosource) run theirs against the copies embedded in their test files —
 * which must be exactly what the generator renders, or the native targets are checking a
 * different sheet.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  KOTLIN_TARGET,
  SWIFT_TARGET,
  VECTORS,
  renderKotlin,
  renderSwift,
  replaceRegion,
  type Vectors,
} from './native-vectors'
import { AuthError, decodeBase64url, verifyIdToken } from '../index'
import type { Jwk, OidcMetadata } from '../index'

const v = JSON.parse(readFileSync(VECTORS, 'utf8')) as Vectors

describe('ID-token parity vectors', () => {
  it('covers the verifier: every outcome, both algorithms', () => {
    expect(v.cases.length).toBeGreaterThanOrEqual(30)
    const outcomes = new Set(v.cases.map((c) => c.expect))
    for (const o of ['ok', 'bad_token', 'bad_alg', 'no_key', 'bad_signature', 'bad_iss', 'bad_aud', 'bad_azp', 'expired', 'not_yet_valid', 'bad_nonce']) {
      expect(outcomes.has(o), o).toBe(true)
    }
  })

  const meta: OidcMetadata = { issuer: v.issuer, authorization_endpoint: `${v.issuer}/auth`, token_endpoint: `${v.issuer}/token` }
  for (const c of v.cases) {
    it(`web: ${c.name} → ${c.expect}`, async () => {
      let got = 'ok'
      try {
        await verifyIdToken(c.token, v.keys as Jwk[], meta, {
          clientId: v.clientId,
          now: v.now * 1000,
          ...(c.nonce === undefined ? {} : { nonce: c.nonce }),
        })
      } catch (e) {
        got = e instanceof AuthError ? e.code : `unexpected ${String(e)}`
      }
      expect(got).toBe(c.expect)
    })
  }

  it('the Swift and Kotlin tests embed exactly this sheet', () => {
    for (const [file, region] of [
      [SWIFT_TARGET, renderSwift(v)],
      [KOTLIN_TARGET, renderKotlin(v)],
    ] as const) {
      const text = readFileSync(file, 'utf8')
      expect(text, `${file} is stale — run bun scripts/gen-native-vectors.ts --render`).toBe(replaceRegion(text, region))
    }
  })
})

describe('decodeBase64url', () => {
  it('decodes canonical base64url and nothing else', () => {
    expect(new TextDecoder().decode(decodeBase64url('QUJD'))).toBe('ABC')
    expect(decodeBase64url('')).toHaveLength(0)
    for (const bad of ['QUJD=', 'QU JD', ' QUJD', 'QUJ+', 'QUJ/', 'Q', 'QR', 'QUJD\n']) {
      expect(() => decodeBase64url(bad), JSON.stringify(bad)).toThrow(/invalid base64url/)
    }
  })
})
