import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/auth',
  title: 'Authentication',
  tagline: 'OIDC/OAuth2 authorization-code + PKCE primitives and route guards — secure by default',
  description:
    'Authentication primitives for Pyreon on Web Crypto + fetch (browsers, Node, Bun, workerd): OIDC/OAuth2 authorization code with S256 PKCE, state, nonce and the RFC 9207 `iss` check; ID-token verification against a cached, rotation-aware JWKS; a reactive `createAuth` state machine with refresh and RP-initiated logout; HMAC cookie sessions with revocation; TOTP; ES256 and RS256 passkeys; an attempt limiter; and an open-redirect-safe route guard. Interop-tested against oidc-provider, a certified OpenID Provider.',
  category: 'universal',
  features: [
    'S256 PKCE only — `plain`, the implicit flow and the password grant are deliberately not offered',
    'state + nonce + RFC 9207 `iss` check on every callback; flows expire after 10 minutes',
    'Discovery refuses a non-https issuer, a non-https endpoint, or an issuer that does not equal the fetched URL',
    'Guard `returnTo` only round-trips same-origin relative paths',
    'Refresh can never switch users; signOut can end the session at the provider',
  ],
  api: [
    {
      name: 'beginAuthorization',
      kind: 'function',
      signature:
        '(meta: OidcMetadata, client: ClientConfig, now?: number) => Promise<{ url: string; flow: PendingFlow }>',
      summary:
        'Builds the authorization redirect (code flow, S256 PKCE, state, nonce) and returns the `PendingFlow` that must survive the round trip. Persist the flow server-side or in a short-lived HttpOnly cookie — never in localStorage — and delete it after the callback whether or not it succeeded.',
      example: `const meta = await discover('https://accounts.example')
const { url, flow } = await beginAuthorization(meta, { clientId: 'app', redirectUri: 'https://app.example/cb' })
// store \`flow\`, then redirect the user to \`url\``,
      mistakes: [
        'Storing the PendingFlow in localStorage — it holds the PKCE verifier; keep it server-side or in an HttpOnly cookie',
        'Reusing a flow for a second callback — it is single-use; delete it after the first attempt',
      ],
      seeAlso: ['parseCallback', 'exchangeCode', 'discover'],
    },
    {
      name: 'parseCallback',
      kind: 'function',
      signature: '(callback: string | URL, flow: PendingFlow, meta: OidcMetadata, now?: number) => { code: string }',
      summary:
        'Validates the redirect back from the provider in a fixed order — expiry, provider error, state, `iss` (RFC 9207), then the code — and throws an `AuthError` with a stable `code` on any failure.',
      example: `const { code } = parseCallback(req.url, flow, meta)`,
      mistakes: ['Catching AuthError and continuing — every failure means the attempt is untrusted'],
      seeAlso: ['beginAuthorization', 'exchangeCode'],
    },
    {
      name: 'exchangeCode',
      kind: 'function',
      signature:
        '(meta: OidcMetadata, client: ClientConfig, flow: PendingFlow, code: string, fetchImpl?: FetchLike) => Promise<TokenResponse>',
      summary:
        'Exchanges the authorization code using the PKCE verifier (public client, no secret) and rejects anything that is not a bearer token response. Redirects from the token endpoint are refused.',
      example: `const tokens = await exchangeCode(meta, client, flow, code)`,
      mistakes: ['Sending a client secret from a browser or native app — public clients rely on PKCE'],
      seeAlso: ['parseCallback'],
    },
    {
      name: 'discover',
      kind: 'function',
      signature: '(issuer: string, fetchImpl?: FetchLike) => Promise<OidcMetadata>',
      summary:
        'Fetches OIDC discovery and validates it: https-only (loopback http allowed for dev), the document issuer must equal the issuer you asked for (OIDC Discovery §4.3), and the authorization and token endpoints must be https. Never pass a user-supplied issuer without an allowlist — discovery is an SSRF vector.',
      example: `const meta = await discover('https://accounts.example')`,
      mistakes: ['Passing a user-controlled issuer URL — allowlist issuers on the server'],
      seeAlso: ['beginAuthorization'],
    },
    {
      name: 'createAuth',
      kind: 'function',
      signature: '(opts: AuthOptions) => Auth',
      summary:
        'Reactive auth state machine over the OIDC primitives. Exposes `status` (signedOut | signingIn | signedIn | error), `tokens`, `claims`, `expiresAt` and `error` as signals plus `signIn`, `handleCallback`, `refresh` and `signOut`. Keys come from a cached JWKS that is re-fetched (throttled) when a token names an unknown `kid`, so provider key rotation needs no restart. `refresh()` keeps the old refresh token when the provider does not rotate it and refuses a refreshed ID token with a different `sub`. `signOut({ endProviderSession: true })` also redirects to the `end_session_endpoint` of the provider with an `id_token_hint`; plain `signOut()` clears local state only. When the provider returns an ID token, `handleCallback` verifies it (signature against the provider JWKS, iss/aud/exp/nbf and this flow\'s nonce) BEFORE reporting `signedIn`, and exposes the verified payload as `claims`; a provider that returns an ID token but publishes no `jwks_uri` is refused. An epoch counter guarantees a late token exchange can never resurrect a session after `signOut()`; pending flows are read-and-deleted from the `FlowStore` so a callback URL cannot be replayed, and `memoryFlowStore` drops abandoned flows after the 10-minute flow lifetime.',
      example: `const auth = createAuth({ issuer: google.issuer, client, flows, redirect: (u) => location.assign(u) })
await auth.signIn()
// on the callback route:
await auth.handleCallback(location.href)`,
      mistakes: [
        'Backing the FlowStore with localStorage — it holds the PKCE verifier; use a server store or an HttpOnly cookie',
        'Reading `auth.status` without calling it — it is a signal',
        'Reading identity from `auth.tokens()?.id_token` — that is the raw token; use the verified `auth.claims()`',
        'Expecting a refresh token without asking for one — request `offline_access`, and pass provider params via `client.authorizationParams` (Google: `access_type: offline`)',
        'Calling `signOut()` and expecting the next sign-in to prompt — the provider session survives; use `signOut({ endProviderSession: true })`',
        'Using `memoryFlowStore` behind a load balancer — a callback landing on another instance fails with `unknown_flow`; back `FlowStore` with a shared store',
      ],
      seeAlso: ['beginAuthorization', 'google', 'keycloak'],
    },
    {
      name: 'signSession',
      kind: 'function',
      signature: '(payload: SessionPayload, opts: SessionOptions, now?: number) => Promise<string>',
      summary:
        'Signs a session into a cookie-safe `body.signature` string (HMAC-SHA256 over Web Crypto). Expiry lives inside the signed body, secrets must be at least 32 characters and rotate via a list (first signs, all verify), and values over 4096 bytes are refused. `verifySession` returns null — never throws — for tampered, expired or malformed input. Pair with `sessionCookie` for HttpOnly + Secure + SameSite=Lax + `__Host-` attributes.',
      example: `const cookie = sessionCookie('session', await signSession({ sub: user.id }, { secrets: [process.env.SESSION_SECRET!] }))
const session = await verifySession(value, { secrets: [process.env.SESSION_SECRET!] })`,
      mistakes: [
        'Putting the whole user profile in the cookie — it is capped at 4096 bytes; store a session id and look the rest up',
        'Replacing the secret instead of prepending it — existing sessions are invalidated; rotate by putting the new secret first',
      ],
      seeAlso: ['verifySession', 'sessionCookie'],
    },
    {
      name: 'verifySession',
      kind: 'function',
      signature: '(value: string, opts: SessionOptions, now?: number) => Promise<SessionPayload | null>',
      summary:
        'Verifies a `signSession` value: HMAC against each secret in turn (rotation), then expiry and `sub`. Returns null — never throws — for anything invalid. A signed cookie is otherwise valid until it expires, so pass `isRevoked(jti, payload)` (sync or async) to make sessions revocable: every session carries a random `jti`, and a revoked one is rejected after the signature passes. Keep revoked ids until their `exp`, then drop them.',
      example: `const session = await verifySession(cookie, {
  secrets: [process.env.SESSION_SECRET!],
  isRevoked: (jti) => revoked.has(jti),
})`,
      mistakes: [
        'Treating logout as "delete the cookie" — a copied cookie stays valid until it expires unless you check `isRevoked`',
        'Keeping revoked ids forever — they are only needed until the session would have expired',
      ],
      seeAlso: ['signSession'],
    },
    {
      name: 'createAttemptLimiter',
      kind: 'function',
      signature: '(opts?: AttemptLimiterOptions) => AttemptLimiter',
      summary:
        'Fixed-window attempt limiter for brute-forceable checks (TOTP codes, passkey and password attempts): at most `max` attempts per `windowMs` per key, reporting `retryAfterMs` when exhausted; call `reset(key)` after a success. Per process and bounded — expired windows are dropped as they are touched and the table never exceeds `maxKeys` (oldest window evicted first), so a flood of distinct keys cannot grow it without limit. Run several instances? Keep the same counters in a shared store.',
      example: `const limiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60_000 })
const gate = limiter.attempt(userId)
if (!gate.allowed) return tooManyRequests(gate.retryAfterMs)
const r = await verifyTotp(secret, code, { lastUsedStep })
if (r.ok) limiter.reset(userId)`,
      mistakes: [
        'Keying only by IP — an attacker rotates addresses; key by account as well',
        'Relying on it across instances — each process counts separately',
      ],
      seeAlso: ['verifyTotp', 'verifyAssertion'],
    },
    {
      name: 'github',
      kind: 'constant',
      signature: 'OidcMetadata',
      summary:
        'Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). `facebook(version)` and `oauth2(issuer, authorize, token)` cover other plain OAuth2 providers. Pass as `createAuth({ metadata })` to skip discovery. Pin the Facebook Graph version you have tested.',
      example: `const auth = createAuth({ metadata: github, client, flows, redirect })`,
      mistakes: ['Expecting an `id_token` from a non-OIDC provider — fetch the profile with the access token instead'],
      seeAlso: ['createAuth', 'google', 'keycloak'],
    },
    {
      name: 'verifyIdToken',
      kind: 'function',
      signature: '(token: string, keys: readonly Jwk[], meta: OidcMetadata, opts: VerifyOptions) => Promise<IdTokenClaims>',
      summary:
        'Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refused to rule out algorithm confusion), signature against the provider JWKS key chosen by `kid` and the header alg, then `iss`, `aud` (+ `azp` for multi-audience tokens), `exp` and `nbf` with 60 s skew, `sub` and the `nonce` you stored in the pending flow. A token declaring `crit` header extensions is refused (none are understood), and malformed input fails with an `AuthError`, never a raw TypeError. Fetch keys with `fetchJwks(meta)` and cache them server-side; call this on the server, never trust an unverified `id_token`.',
      example: `const keys = await fetchJwks(meta)
const claims = await verifyIdToken(tokens.id_token!, keys, meta, { clientId: client.clientId, nonce: flow.nonce })`,
      mistakes: [
        'Decoding the id_token payload without verifying the signature — anyone can forge it',
        'Skipping the nonce — it binds the token to this login attempt and defeats replay',
        'Refetching the JWKS on every request — cache it and refresh only on an unknown `kid`',
      ],
      seeAlso: ['fetchJwks', 'exchangeCode'],
    },
    {
      name: 'runStrategy',
      kind: 'function',
      signature: "(strategy: PassportStrategyLike, input: PassportInput, options?: Record<string, unknown>) => Promise<PassportOutcome>",
      summary:
        "Passport bridge (`@pyreon/auth/passport`, server only). Runs any Passport strategy — passport-local, passport-oauth2, Keycloak, SAML — without Express or the `passport` package: the strategy is cloned, its `success/fail/redirect/pass/error` hooks are bound to a promise, and the result is a discriminated outcome. Strategies that keep OAuth state in `req.session` write it into the `session` object you pass, so back that with the pending-flow store. Rejects only when the strategy calls `error()` or throws.",
      example: `import { runStrategy } from '@pyreon/auth/passport'
const out = await runStrategy(new LocalStrategy(verify), { method: 'POST', url: '/login', body })
if (out.type === 'success') startSession(out.user)`,
      mistakes: [
        'Passing a shared `session` object across users — create one per attempt, it carries OAuth state/verifier',
        'Treating `fail` as an exception — it is a normal outcome (bad credentials); only `error` rejects',
      ],
      seeAlso: ['createAuth', 'signSession'],
    },
    {
      name: 'verifyTotp',
      kind: 'function',
      signature: '(secret: string, code: string, opts?: { now?: number; window?: number; lastUsedStep?: number | undefined }) => Promise<{ ok: true; step: number } | { ok: false }>',
      summary:
        'RFC 6238 TOTP second factor (HMAC-SHA1, 6 digits, 30 s) on Web Crypto, verified against the RFC test vectors and compatible with Google Authenticator. Accepts +/-1 step by default and returns the matched step so you can persist it and pass it back as lastUsedStep, which is what rejects replay of a code inside its window. generateTotpSecret() makes a 160-bit base32 setup key; totp() generates a code.',
      example: `const r = await verifyTotp(user.totpSecret, input, { lastUsedStep: user.lastTotpStep })
if (r.ok) await save({ lastTotpStep: r.step })`,
      mistakes: [
        'Not storing the returned step: without lastUsedStep a captured code can be replayed for up to 90 s',
        'Rate-limiting nothing: six digits is brute-forceable, so limit attempts per account before calling this',
      ],
      seeAlso: ['createAttemptLimiter', 'signSession'],
    },
    {
      name: 'verifyAssertion',
      kind: 'function',
      signature: '(a: AssertionInput, e: AssertionExpectations) => Promise<AssertionResult>',
      summary:
        'Server-side WebAuthn sign-in (passkey assertion) verification for ES256 and RS256 credentials on Web Crypto; the type of the STORED key picks the algorithm, never the assertion. Checks ceremony type, the single-use challenge from passkeyChallenge(), exact origin, a top-level (not cross-origin iframe) ceremony unless `allowCrossOrigin` is set, the rpId hash, user presence, user verification (required by default), a strictly increasing signCount (cloned-authenticator signal) and the ECDSA signature over authenticatorData || SHA-256(clientDataJSON), converting an ES256 DER signature to the raw form WebCrypto expects (RS256 signatures are used as-is). Returns { ok: false, reason } instead of throwing. Pass the JWK `verifyRegistration` returned.',
      example: `const challenge = passkeyChallenge() // store server-side, single use
const r = await verifyAssertion(body, { challenge, origin: 'https://app.example', rpId: 'app.example', publicKey: cred.jwk, signCount: cred.signCount })
if (r.ok) await save({ signCount: r.signCount })`,
      mistakes: [
        'Reusing a challenge: it must be generated per attempt and deleted after verification',
        'Skipping the stored signCount update: it is what detects a cloned authenticator',
        'Verifying against a wrong or wildcard origin: it must equal your exact origin',
      ],
      seeAlso: ['verifyRegistration', 'createAttemptLimiter'],
    },
    {
      name: 'verifyRegistration',
      kind: 'function',
      signature: '(r: RegistrationInput, e: RegistrationExpectations) => Promise<RegistrationResult>',
      summary:
        'Server-side WebAuthn passkey registration for ES256 (P-256) and RS256 (RSA >= 2048 bits, used by Windows Hello) credentials with none attestation, which is what passkey providers send by default. Decodes the attestation object with a built-in minimal CBOR reader, checks ceremony type, single-use challenge, exact origin, a top-level ceremony (`allowCrossOrigin` opts in to iframes), rpId hash, user presence/verification and attested-credential data, and converts the COSE key to a JWK (EC points validated on the curve; the key type is pinned to the algorithm) that verifyAssertion accepts directly. Any other attestation format or algorithm is refused with a reason rather than silently trusted.',
      example: `const r = await verifyRegistration(body, { challenge, origin: 'https://app.example', rpId: 'app.example' })
if (r.ok) await db.credentials.insert({ id: r.credentialId, jwk: r.publicKey, signCount: r.signCount })`,
      mistakes: [
        'Accepting packed/tpm attestation without verifying the statement: this function refuses them instead of trusting them',
        'Storing the credential id and key without the user id: bind the credential to the signed-in account before saving',
        'Requesting only alg -7 from the browser: add -257 (RS256) to pubKeyCredParams or Windows Hello cannot register',
      ],
      seeAlso: ['verifyAssertion', 'passkeyChallenge'],
    },
    {
      name: 'createGuard',
      kind: 'function',
      signature: '<S>(opts: GuardOptions<S>) => (path: string) => GuardResult',
      summary:
        'Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `returnTo`. Adapt it to a router `beforeEnter`. `safeReturnTo` accepts only a same-origin path: it rejects `//`, backslashes and every control character (browsers strip tab/CR/LF before parsing, so `/\\t/evil.example` would otherwise navigate to `//evil.example`), then confirms the value resolves to the same origin under the WHATWG URL parser.',
      example: `const guard = createGuard({ session: () => user(), loginPath: '/login' })
guard('/account') // true | { redirect: '/login?returnTo=%2Faccount' }`,
      mistakes: ['Trusting a `returnTo` query param directly — run it through `safeReturnTo`'],
      seeAlso: ['safeReturnTo'],
    },
  ],
  multiplatform: {
    tier: 'web-only',
    rationale:
      'the native OIDC/PKCE mechanism (PyreonOidc.swift/.kt) is co-sourced and device-tested in isolation, but no PMTC recognizer lowers the web API yet; native apps use the existing useAuth container from @pyreon/hooks for state, and this package supplies the sign-in mechanism that drives it',
  },
})
