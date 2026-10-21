/**
 * An OpenID Provider that runs inside the page, for the live auth examples.
 *
 * Nothing here is mocked away from `@pyreon/auth`: the examples hand this provider's
 * `fetch` to the REAL `useOidc`, which runs real discovery, real S256 PKCE, and verifies a
 * real ES256 signature over a real ID token against the keys this provider publishes. What
 * the provider fakes is only the network and the login page.
 *
 * `mode` makes the provider misbehave in one specific way at a time, so a demo can show which
 * check catches which attack — the same checks a real provider is held to.
 */
import { base64url, codeChallengeS256 } from '@pyreon/auth'
import type { FetchLike, Jwk } from '@pyreon/auth'
import { signal, type Signal } from '@pyreon/reactivity'

export const ISSUER = 'https://id.example.dev'
export const CLIENT_ID = 'docs-demo'
export const REDIRECT_URI = 'https://app.example.dev/callback'

/** One way the provider can misbehave. `honest` follows the spec. */
export type ProviderMode =
  | 'honest'
  /** Signs the ID token for someone else's sign-in (a replayed / injected token). */
  | 'wrong-nonce'
  /** Signs with a key it does not publish (a forged token). */
  | 'forged-key'
  /** Claims, on the redirect, to be a different issuer (an IdP mix-up attack). */
  | 'mix-up'
  /** The user clicks "Deny" on the consent screen. */
  | 'deny'
  /** On refresh, returns an ID token for a DIFFERENT user. */
  | 'swap-user'

export interface FakeProvider {
  readonly fetch: FetchLike
  /**
   * Play the provider's login page: read the authorization request, "sign the user in",
   * and return the URL the provider would redirect back to.
   */
  authorize(authorizationUrl: string): Promise<string>
  readonly mode: Signal<ProviderMode>
  /** What the provider saw, newest last — the wire, made visible. */
  readonly log: Signal<string[]>
  /** Set once the app sends the user to the end-session endpoint. */
  readonly sessionEnded: Signal<boolean>
}

const enc = new TextEncoder()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

async function keypair(kid: string): Promise<{ priv: CryptoKey; jwk: Jwk }> {
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', k.publicKey)) as Jwk
  return { priv: k.privateKey, jwk: { ...jwk, kid, alg: 'ES256', use: 'sig' } }
}

async function signJwt(priv: CryptoKey, kid: string, claims: Record<string, unknown>): Promise<string> {
  const h = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })))
  const p = base64url(enc.encode(JSON.stringify(claims)))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(`${h}.${p}`)))
  return `${h}.${p}.${base64url(sig)}`
}

const USERS = {
  ada: { sub: 'user-ada', email: 'ada@example.dev', name: 'Ada Lovelace' },
  alan: { sub: 'user-alan', email: 'alan@example.dev', name: 'Alan Turing' },
}

export function createFakeProvider(): FakeProvider {
  const mode = signal<ProviderMode>('honest')
  const log = signal<string[]>([])
  const sessionEnded = signal(false)
  const note = (line: string) => log.set([...log.peek().slice(-7), line])

  // The published key and a second key the provider never publishes (for `forged-key`).
  const keys = Promise.all([keypair('key-1'), keypair('key-rogue')])
  // code → what the token endpoint needs to honour it.
  const codes = new Map<string, { challenge: string; nonce: string }>()
  const refreshTokens = new Set<string>()
  const now = () => Math.floor(Date.now() / 1000)

  const idToken = async (user: (typeof USERS)['ada'], nonce: string | undefined): Promise<string> => {
    const [published, rogue] = await keys
    const forged = mode.peek() === 'forged-key'
    const claims = {
      iss: ISSUER,
      aud: CLIENT_ID,
      iat: now(),
      exp: now() + 3600,
      ...user,
      ...(nonce === undefined ? {} : { nonce: mode.peek() === 'wrong-nonce' ? 'a-nonce-from-another-tab' : nonce }),
    }
    // A forged token still NAMES the published kid — that is what an attacker would do.
    return signJwt(forged ? rogue.priv : published.priv, 'key-1', claims)
  }

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input)
    if (url.pathname === '/.well-known/openid-configuration') {
      note('GET discovery')
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        end_session_endpoint: `${ISSUER}/logout`,
        authorization_response_iss_parameter_supported: true,
      })
    }
    if (url.pathname === '/jwks') {
      note('GET jwks (signing keys)')
      return json({ keys: [(await keys)[0].jwk] })
    }
    if (url.pathname === '/token') {
      const body = new URLSearchParams(String(init?.body ?? ''))
      const grant = body.get('grant_type')
      if (grant === 'authorization_code') {
        const entry = codes.get(body.get('code') ?? '')
        codes.delete(body.get('code') ?? '') // codes are single-use
        const verifier = body.get('code_verifier') ?? ''
        if (!entry || (await codeChallengeS256(verifier)) !== entry.challenge) {
          note('POST token → 400 (PKCE verifier did not match)')
          return json({ error: 'invalid_grant' }, 400)
        }
        note('POST token (code + PKCE verifier) → tokens')
        const refresh = base64url(crypto.getRandomValues(new Uint8Array(16)))
        refreshTokens.add(refresh)
        return json({
          token_type: 'Bearer',
          access_token: base64url(crypto.getRandomValues(new Uint8Array(24))),
          refresh_token: refresh,
          expires_in: 3600,
          id_token: await idToken(USERS.ada, entry.nonce),
        })
      }
      if (grant === 'refresh_token') {
        const presented = body.get('refresh_token') ?? ''
        if (!refreshTokens.delete(presented)) return json({ error: 'invalid_grant' }, 400)
        const rotated = base64url(crypto.getRandomValues(new Uint8Array(16)))
        refreshTokens.add(rotated)
        note('POST token (refresh_token) → rotated tokens')
        return json({
          token_type: 'Bearer',
          access_token: base64url(crypto.getRandomValues(new Uint8Array(24))),
          refresh_token: rotated,
          expires_in: 3600,
          id_token: await idToken(mode.peek() === 'swap-user' ? USERS.alan : USERS.ada, undefined),
        })
      }
    }
    return json({ error: 'not_found' }, 404)
  }

  return {
    fetch: fetchImpl,
    mode,
    log,
    sessionEnded,
    async authorize(authorizationUrl) {
      const req = new URL(authorizationUrl)
      if (req.pathname === '/logout') {
        note('→ end_session_endpoint (provider session ended)')
        sessionEnded.set(true)
        return ''
      }
      const p = req.searchParams
      note(`→ authorize (PKCE ${p.get('code_challenge_method')}, state + nonce)`)
      const back = new URL(p.get('redirect_uri') ?? REDIRECT_URI)
      back.searchParams.set('state', p.get('state') ?? '')
      if (mode.peek() === 'deny') {
        back.searchParams.set('error', 'access_denied')
        return back.toString()
      }
      const code = base64url(crypto.getRandomValues(new Uint8Array(16)))
      codes.set(code, { challenge: p.get('code_challenge') ?? '', nonce: p.get('nonce') ?? '' })
      back.searchParams.set('code', code)
      back.searchParams.set('iss', mode.peek() === 'mix-up' ? 'https://evil-idp.example' : ISSUER)
      sessionEnded.set(false)
      return back.toString()
    },
  }
}
