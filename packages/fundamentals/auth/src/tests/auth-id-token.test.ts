/**
 * `createAuth` must not report `signedIn` on an unverified ID token.
 *
 * The OIDC primitives ship `verifyIdToken`, but the reactive state machine used to
 * exchange the code and flip to `signedIn` without calling it — so an app reading
 * `tokens().id_token` for identity trusted a token whose signature and nonce were
 * never checked. These specs mint real ES256 tokens and drive the full flow.
 */
import { describe, expect, it } from 'vitest'
import { base64url, createAuth, memoryFlowStore } from '../index'
import type { FetchLike, Jwk } from '../index'

const issuer = 'https://idp.example'
const enc = new TextEncoder()
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

async function keypair(): Promise<{ priv: CryptoKey; jwk: Jwk }> {
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', k.publicKey)) as Jwk
  return { priv: k.privateKey, jwk: { ...jwk, kid: 'k1', alg: 'ES256', use: 'sig' } }
}

async function sign(priv: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  const h = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: 'k1', typ: 'JWT' })))
  const p = base64url(enc.encode(JSON.stringify(claims)))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(`${h}.${p}`)))
  return `${h}.${p}.${base64url(sig)}`
}

interface Scenario {
  jwks?: boolean
  idToken?: (nonce: string) => Promise<string | undefined>
}

const now = () => Math.floor(Date.now() / 1000)
const goodClaims = (nonce: string) => ({ iss: issuer, sub: 'u1', aud: 'app', exp: now() + 300, iat: now(), nonce })

describe('createAuth — ID token verification', () => {
  it('a valid ID token signs in and exposes its verified claims', async () => {
    const kp = await keypair()
    const { auth } = await runWith(kp, { idToken: (n) => sign(kp.priv, goodClaims(n)) })
    expect(auth.status()).toBe('signedIn')
    expect(auth.claims()?.sub).toBe('u1')
  })

  it('rejects an ID token whose nonce is not this flow’s', async () => {
    const kp = await keypair()
    const { auth } = await runWith(kp, { idToken: () => sign(kp.priv, goodClaims('someone-elses-nonce')) })
    expect(auth.status()).toBe('error')
    expect(auth.error()?.code).toBe('bad_nonce')
    expect(auth.tokens()).toBeNull()
    expect(auth.claims()).toBeNull()
  })

  it('rejects an ID token signed by a key the provider does not publish', async () => {
    const kp = await keypair()
    const forger = await keypair()
    const { auth } = await runWith(kp, { idToken: (n) => sign(forger.priv, goodClaims(n)) })
    expect(auth.status()).toBe('error')
    expect(auth.error()?.code).toBe('bad_signature')
    expect(auth.tokens()).toBeNull()
  })

  it('refuses an ID token it has no keys to verify', async () => {
    const kp = await keypair()
    const { auth } = await runWith(kp, { jwks: false, idToken: (n) => sign(kp.priv, goodClaims(n)) })
    expect(auth.status()).toBe('error')
    expect(auth.error()?.code).toBe('no_jwks')
  })

  it('an OAuth2-only provider (no ID token) still signs in, with no claims', async () => {
    const kp = await keypair()
    const { auth } = await runWith(kp, { jwks: false })
    expect(auth.status()).toBe('signedIn')
    expect(auth.claims()).toBeNull()
  })
})

/** Drive signIn → callback against a fake provider publishing `kp`'s public key. */
async function runWith(kp: { priv: CryptoKey; jwk: Jwk }, s: Scenario) {
  const meta: Record<string, unknown> = {
    issuer,
    authorization_endpoint: `${issuer}/auth`,
    token_endpoint: `${issuer}/token`,
  }
  if (s.jwks !== false) meta.jwks_uri = `${issuer}/jwks`
  let nonce = ''
  const f: FetchLike = async (u) => {
    if (u.endsWith('openid-configuration')) return json(meta)
    if (u.endsWith('/jwks')) return json({ keys: [kp.jwk] })
    const id_token = s.idToken ? await s.idToken(nonce) : undefined
    return json({ access_token: 'at', token_type: 'Bearer', ...(id_token ? { id_token } : {}) })
  }
  const redirects: string[] = []
  const auth = createAuth({
    issuer,
    client: { clientId: 'app', redirectUri: 'https://app.example/cb' },
    flows: memoryFlowStore(),
    redirect: (u) => redirects.push(u),
    fetch: f,
  })
  await auth.signIn()
  const authUrl = new URL(redirects[0]!)
  nonce = authUrl.searchParams.get('nonce')!
  await auth.handleCallback(`https://app.example/cb?code=c&state=${authUrl.searchParams.get('state')}`)
  return { auth }
}
