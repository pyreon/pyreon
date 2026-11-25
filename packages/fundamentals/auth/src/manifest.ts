import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/auth',
  title: 'Authentication',
  tagline: 'OIDC sign-in on web, iOS and Android, ID-token verification, sessions, TOTP and passkeys — secure by default',
  description:
    'Authentication primitives for Pyreon on Web Crypto + fetch (browsers, Node, Bun, workerd): OIDC/OAuth2 authorization code with S256 PKCE, state and nonce, pending flows bound to their client, redirect URI and browser (login-CSRF and mix-up defence), and the RFC 9207 `iss` check; ID-token verification against a cached, rotation-aware JWKS; a reactive `createAuth` state machine with refresh and RP-initiated logout; HMAC cookie sessions with revocation; TOTP; ES256 and RS256 passkeys; an attempt limiter; and an open-redirect-safe route guard. Interop-tested against oidc-provider, a certified OpenID Provider.',
  category: 'universal',
  features: [
    'S256 PKCE only — `plain`, the implicit flow and the password grant are deliberately not offered',
    'state + nonce on every callback; a pending flow completes only for the client, redirect URI and browser that started it (login CSRF, OAuth mix-up), plus the RFC 9207 `iss` check; flows expire after 10 minutes',
    'One redirect URI per provider (RFC 9700 §4.4), web and native: a shared one is allowed only between providers that send RFC 9207 `iss`, and a callback there must carry it',
    'Discovery refuses a non-https issuer, a non-https endpoint, or an issuer that does not equal the fetched URL',
    'Guard `returnTo` only round-trips same-origin relative paths',
    'Refresh can never switch users; signOut revokes the tokens (RFC 7009) when the provider advertises it, and can end the session at the provider',
  ],
  api: [
    {
      name: 'useOidc',
      kind: 'hook',
      signature: '(opts: UseOidcOptions) => UseOidcResult',
      summary:
        'A reactive OIDC sign-in with the SAME surface on web, iOS and Android — the shared-source entry point. Every member is read as a call (`auth.status()`, `auth.subject()`, `auth.claim("email")`, `auth.accessToken()`, `auth.expiresAt()`, `auth.error()`, `auth.isAuthenticated()`), and the strings it returns (status spellings, error codes) are identical on all three targets. On the web it is `createAuth` with browser defaults: pending sign-ins in `sessionStorage` (they must survive the full-page round trip), navigation by `location.assign`, and on the redirect page the callback is completed automatically, with the code scrubbed from the address bar and history first. In shared source it lowers to the native `PyreonOidcAuth`, which runs the system browser, verifies the ID token against the provider keys, refreshes, and keeps the session in the Keychain / Keystore so the app is still signed in after a relaunch. Persistence is the one deliberate divergence: the web holds tokens in memory only, so a reload starts at `signedOut` — storing them in `localStorage` / `sessionStorage` would make any XSS bug a stolen long-lived session. Re-run `signIn()` on load (it completes without a prompt while the provider session lasts) or keep the session server-side behind an HttpOnly cookie (`signSession`). Options must be static (literals or module consts) because native bakes them in. Call it ONCE at the app root and pass `auth` down.',
      example: `const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback',
  nativeRedirectUri: 'com.example.app:/oauth',
  scope: 'openid profile email offline_access',
})
// <Button onPress={() => auth.signIn()}>Sign in</Button>
// <Text>{auth.isAuthenticated() ? auth.claim('email') : auth.status()}</Text>`,
      mistakes: [
        'Omitting `nativeRedirectUri` — a native app cannot receive a redirect to the web page unless it is a claimed universal link / App Link; register an app-scheme redirect with the provider',
        'Calling useOidc in several components — each call is its own session object; create one at the root and pass it down',
        'Giving two providers the same `nativeRedirectUri` (one app scheme) — the compiler warns in one file and the native runtime refuses sign-in unless both send `iss`; use one path per provider (`com.example.app:/oauth/google`)',
        'Building the options at runtime (a prop, a fetch result) — native bakes them at compile time; the call is reported and not emitted',
        'Reading `auth.status` without calling it — every member is a call on the web',
        'Expecting a refresh token without `offline_access` in `scope` (and, for Google, `authorizationParams: { access_type: "offline", prompt: "consent" }`)',
        'Forgetting the Android manifest entries for PyreonAuthActivity / PyreonAuthRedirectActivity — without them the redirect never returns to the app',
        'Relying on a custom scheme on Android — another app can register it and receive the redirect; use a verified App Link (https nativeRedirectUri, `android:autoVerify="true"`, assetlinks.json)',
        'Reading `auth.tokens()?.access_token` from the lower-level `createAuth` for a request — that is the raw response; `useOidc().accessToken()` (and native `accessToken`) return null once the token has expired',
        'Expecting the web session to survive a reload like native does — web tokens live in memory only; re-run `signIn()` on load or keep the session server-side behind an HttpOnly cookie, never in `localStorage`',
      ],
      seeAlso: ['createAuth', 'sessionStorageFlowStore'],
    },
    {
      name: 'sessionStorageFlowStore',
      kind: 'function',
      signature: '(storage?: Storage) => FlowStore',
      summary:
        'The browser flow store `useOidc` uses by default: pending sign-ins (state, nonce, PKCE verifier) in `sessionStorage`, read-and-deleted, with expired and excess entries swept on save. A browser sign-in is a full page load to the provider and back, so an in-memory store is empty when the user returns and every callback fails with `unknown_flow`; `sessionStorage` survives the round trip and is cleared when the tab closes.',
      example: `const auth = createAuth({ issuer, client, flows: sessionStorageFlowStore(), redirect: (u) => location.assign(u) })`,
      mistakes: [
        'Using memoryFlowStore() with a browser redirect — the page reload empties it; use this store (or useOidc, which defaults to it)',
        'Backing flows with localStorage — it outlives the tab and is shared across tabs; sessionStorage is the standard place for a browser client\'s pending authorization',
      ],
      seeAlso: ['useOidc', 'createAuth'],
    },
    {
      name: 'beginAuthorization',
      kind: 'function',
      signature:
        '(meta: OidcMetadata, client: ClientConfig, binding: string, now?: number) => Promise<{ url: string; flow: PendingFlow }>',
      summary:
        'Builds the authorization redirect (code flow, S256 PKCE, state, nonce) and returns the `PendingFlow` that must survive the round trip. The flow records its issuer, client id, redirect URI and the browser `binding` (from `createFlowBinding`), and `parseCallback` checks all of them. Persist the flow server-side — never in localStorage — and delete it after the callback whether or not it succeeded. `createAuth` does all of this for you.',
      example: `const meta = await discover('https://accounts.example')
const binding = createFlowBinding(req.headers.get('cookie'))
const { url, flow } = await beginAuthorization(meta, { clientId: 'app', redirectUri: 'https://app.example/cb' }, binding.value)
// store \`flow\` under its state, then redirect to \`url\` with Set-Cookie: binding.setCookie`,
      mistakes: [
        'Storing the flow without the browser binding check on the way back — anyone holding the callback URL could complete it in another browser (login CSRF); pass the binding to parseCallback',
        'Storing the PendingFlow in localStorage — it holds the PKCE verifier; keep it server-side or in an HttpOnly cookie',
        'Reusing a flow for a second callback — it is single-use; delete it after the first attempt',
      ],
      seeAlso: ['parseCallback', 'exchangeCode', 'discover'],
    },
    {
      name: 'parseCallback',
      kind: 'function',
      signature: '(callback: string | URL, flow: PendingFlow, meta: OidcMetadata, binding: string, now?: number) => { code: string }',
      summary:
        'Validates the redirect back from the provider in a fixed order — expiry; the flow belongs to this issuer (`issuer_mismatch`); it was started in THIS browser (`unbound_flow`, the login-CSRF check); the callback arrived at the flow\'s own redirect URI (`redirect_mismatch` — with one redirect URI per provider, the mix-up check that needs no `iss`); provider error; state; `iss` (RFC 9207); then the code — and throws an `AuthError` with a stable `code` on any failure. `callback` must be the absolute PUBLIC URL the provider redirected to (`invalid_callback` for a path; behind a proxy rebuild it from your configured origin).',
      example: `const { code } = parseCallback(req.url, flow, meta, readFlowBinding(req.headers.get('cookie')) ?? '')`,
      mistakes: ['Catching AuthError and continuing — every failure means the attempt is untrusted'],
      seeAlso: ['beginAuthorization', 'exchangeCode'],
    },
    {
      name: 'exchangeCode',
      kind: 'function',
      signature:
        '(meta: OidcMetadata, client: ClientConfig, flow: PendingFlow, code: string, fetchImpl?: FetchLike) => Promise<TokenResponse>',
      summary:
        'Exchanges the authorization code using the PKCE verifier (public client, no secret) and rejects anything that is not a bearer token response. A flow started for another client or issuer is refused before any request, and redirects from the token endpoint are refused.',
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
        'Reactive auth state machine over the OIDC primitives. Exposes `status` (signedOut | signingIn | signedIn | error), `tokens`, `claims`, `expiresAt` and `error` as signals plus `signIn`, `handleCallback`, `refresh` and `signOut`. Keys come from a cached JWKS that is re-fetched (throttled) when a token names an unknown `kid`, so provider key rotation needs no restart. `refresh()` keeps the old refresh token when the provider does not rotate it and refuses a refreshed ID token with a different `sub`. `signOut()` clears the local session at once and, when the provider advertises a `revocation_endpoint`, revokes the refresh and access tokens there (RFC 7009; `revokeTokens: false` skips it); it resolves to `{ revoked, error }` (covering the tokens held at the call), and a failed revocation still signs out locally; a token response from a sign-in or refresh still in flight, or one discarded for any reason, is revoked when it lands. `signOut({ endProviderSession: true })` also redirects to the `end_session_endpoint` of the provider with an `id_token_hint`, after the revocation (bounded to 5 s). When the provider returns an ID token, `handleCallback` verifies it (signature against the provider JWKS, iss/aud/exp/nbf and this flow\'s nonce) BEFORE reporting `signedIn`, and exposes the verified payload as `claims`; a provider that returns an ID token but publishes no `jwks_uri` is refused. An epoch counter guarantees a late token exchange can never resurrect a session after `signOut()`; pending flows are stored under a key derived from the state, issuer, client id, redirect URI and browser `binding`, and read-and-deleted, so a callback URL cannot be replayed, another provider\'s or client\'s instance never reads the flow, and a callback from another browser finds nothing (login CSRF). One redirect URI per provider (OAuth mix-up, RFC 9700 §4.4): instances are registered process-wide by redirect URI; two providers may share one only if both send RFC 9207 `iss` — a provider known not to is refused at construction (explicit metadata) or at sign-in (`redirect_shared`, after discovery), and every callback on a shared URI must carry `iss`. `dispose()` releases the claim (`useOidc` does it with its scope); a disposed instance that signs in again registers again. `handleCallback` takes an absolute URL or the request path and query (resolved against the configured redirect origin — what a server behind a TLS-terminating proxy must pass). A redirect URI the matcher refuses (non-ASCII host — use punycode —, `%2e`, backslash, whitespace) throws at construction. A refresh that fails because the provider is unreachable or unavailable (`network_error`, `provider_unavailable`, `discovery_failed`, `jwks_failed`) keeps the session for a retry with `status` `error`; any other failure ends it. Concurrent `refresh()` calls for one session share one request (a call after a sign-out and new sign-in starts its own), and a refresh never discards a sign-in in flight nor overwrites a newer session. `memoryFlowStore` drops abandoned flows after the 10-minute flow lifetime.',
      example: `// a server (backend-for-frontend): one shared store, one createAuth per request
const binding = createFlowBinding(req.headers.get('cookie')) // send binding.setCookie with the redirect
const auth = createAuth({ issuer: google.issuer, client, flows, binding: binding.value, redirect: (u) => respond(u) })
await auth.signIn()
// on the callback route:
const back = createAuth({ issuer: google.issuer, client, flows, binding: readFlowBinding(req.headers.get('cookie')), redirect: respond })
await back.handleCallback(req.url)`,
      mistakes: [
        'Leaving out `binding` on a server — the flow is then not tied to the browser and an attacker can sign a victim in to the attacker\'s account (login CSRF); createAuth refuses to start without it unless the store is tab-scoped',
        'Pointing two providers at one redirect URI — give each its own (e.g. /auth/callback/github); sharing works only between providers that all send RFC 9207 `iss`',
        'Passing the server\'s internal absolute URL behind a proxy (`http://127.0.0.1:3000/…`) — it fails with `redirect_mismatch`; pass the path and query (`req.url` in Node) or the public URL',
        'Backing the FlowStore with localStorage — it holds the PKCE verifier; use a server store or an HttpOnly cookie',
        'Reading `auth.status` without calling it — it is a signal',
        'Reading identity from `auth.tokens()?.id_token` — that is the raw token; use the verified `auth.claims()`',
        'Expecting a refresh token without asking for one — request `offline_access`, and pass provider params via `client.authorizationParams` (Google: `access_type: offline`)',
        'Calling `signOut()` and expecting the next sign-in to prompt — the provider session survives; use `signOut({ endProviderSession: true })`',
        'Treating a resolved `signOut()` as proof the tokens are dead — check `revoked`: a provider without a `revocation_endpoint`, or a refused revocation, leaves them valid until they expire',
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
        'Fixed-window attempt limiter for brute-forceable checks (TOTP codes, passkey and password attempts): at most `max` attempts per `windowMs` per key, reporting `retryAfterMs` when exhausted; call `reset(key)` after a success. Per process and bounded — expired windows are dropped as they are touched and the table never exceeds `maxKeys`, so a flood of distinct keys cannot grow it without limit. Eviction never frees a blocked key: a full table drops an expired window, else the active window with the fewest attempts, never one at its limit; when every slot is at its limit the NEW key is refused (fail closed), so a key flood can delay first attempts from new keys but never buys a blocked key more guesses — size `maxKeys` above the keys legitimately active in one window. Run several instances? Keep the same counters in a shared store.',
      example: `const limiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60_000 })
const gate = limiter.attempt(userId)
if (!gate.allowed) return tooManyRequests(gate.retryAfterMs)
const r = await verifyTotp(secret, code, { lastUsedStep })
if (r.ok) limiter.reset(userId)`,
      mistakes: [
        'Keying only by IP — an attacker rotates addresses; key by account as well',
        'Relying on it across instances — each process counts separately',
        'Setting `maxKeys` near the number of keys legitimately active in one window — a full table of blocked windows refuses new keys until the oldest window ends',
      ],
      seeAlso: ['verifyTotp', 'verifyAssertion'],
    },
    {
      name: 'github',
      kind: 'constant',
      signature: 'OidcMetadata',
      summary:
        'Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). `facebook(version)` and `oauth2(issuer, authorize, token)` cover other plain OAuth2 providers. Pass as `createAuth({ metadata })` to skip discovery. Explicit endpoints are checked where they are used: the authorization and token endpoints must be https (loopback http allowed for local development) or the call fails with `insecure_url`, on web, iOS and Android alike. Pin the Facebook Graph version you have tested.',
      example: `const auth = createAuth({ metadata: github, client, flows, redirect })`,
      mistakes: ['Expecting an `id_token` from a non-OIDC provider — fetch the profile with the access token instead'],
      seeAlso: ['createAuth', 'google', 'keycloak'],
    },
    {
      name: 'verifyIdToken',
      kind: 'function',
      signature: '(token: string, keys: readonly Jwk[] | JwksCache, meta: OidcMetadata, opts: VerifyOptions) => Promise<IdTokenClaims>',
      summary:
        'Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refused to rule out algorithm confusion), signature against a provider key chosen by `kid`, the header alg, `use`, `key_ops` (must allow `verify`) and size (RSA keys under 2048 bits are ignored), then `iss`, `aud`, `azp` (required for multi-audience tokens, and when present it must be this client), `exp` / `nbf` / `iat` with 60 s skew (`maxAge` optionally bounds the age), `sub` and the `nonce` you stored in the pending flow. A token declaring `crit` header extensions is refused, and malformed input fails with an `AuthError`, never a raw TypeError. Pass a `createJwksCache` cache as `keys` and a token that fails against the cached keys (rotation, or no `kid`) triggers one throttled re-fetch.',
      example: `const jwks = createJwksCache(meta)
const claims = await verifyIdToken(tokens.id_token!, jwks, meta, { clientId: client.clientId, nonce: flow.nonce })`,
      mistakes: [
        'Decoding the id_token payload without verifying the signature — anyone can forge it',
        'Skipping the nonce — it binds the token to this login attempt and defeats replay',
        'Refetching the JWKS on every request — cache it and refresh only on an unknown `kid`',
      ],
      seeAlso: ['createJwksCache', 'exchangeCode'],
    },
    {
      name: 'runStrategy',
      kind: 'function',
      signature: "(strategy: PassportStrategyLike, input: PassportInput, options?: Record<string, unknown>) => Promise<PassportOutcome>",
      summary:
        "Passport bridge (`@pyreon/auth/passport`, server only). Runs any Passport strategy — passport-local, passport-oauth2, Keycloak, SAML — without Express or the `passport` package: the strategy is cloned, its `success/fail/redirect/pass/error` hooks are bound to a promise, and the result is a discriminated outcome. Strategies that keep OAuth state in `req.session` (passport-oauth2: state and PKCE verifier) write it into the `session` object you pass and check it on the callback — that check is what ties the sign-in to the browser, so `session` must be the same browser's session on both requests: persist it server-side keyed by a cookie of that browser (`createFlowBinding` / `readFlowBinding`), never by the `state` from the callback URL (that reopens login CSRF). The bridge itself stores nothing. Rejects only when the strategy calls `error()` or throws.",
      example: `import { runStrategy } from '@pyreon/auth/passport'
const out = await runStrategy(new LocalStrategy(verify), { method: 'POST', url: '/login', body })
if (out.type === 'success') startSession(out.user)`,
      mistakes: [
        'Sharing one `session` object across browsers, or loading it by the callback\'s `state` — key it by a cookie of the browser (`readFlowBinding`), so only the browser that started the sign-in can finish it',
        'Treating `fail` as an exception — it is a normal outcome (bad credentials); only `error` rejects',
      ],
      seeAlso: ['createAuth', 'signSession'],
    },
    {
      name: 'verifyTotp',
      kind: 'function',
      signature: '(secret: string, code: string, opts?: { period?: number; digits?: number; allowShortSecret?: boolean; now?: number; window?: number; lastUsedStep?: number }) => Promise<{ ok: true; step: number } | { ok: false }>',
      summary:
        'RFC 6238 TOTP second factor (HMAC-SHA1, default 6 digits and 30 s, both configurable and shared with totp()) on Web Crypto, verified against the RFC test vectors and compatible with Google Authenticator. A secret under 128 bits throws (RFC 4226; `allowShortSecret: true` admits existing 80-bit secrets) — a setup error, not a wrong code. Accepts +/-1 step by default and returns the matched step so you can persist it and pass it back as lastUsedStep, which is what rejects replay of a code inside its window. generateTotpSecret() makes a 160-bit base32 setup key; totp() generates a code.',
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
        'Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `returnTo`. Adapt it to a router `beforeEnter`. The `returnTo` goes through `safeReturnTo`.',
      example: `const guard = createGuard({ session: () => user(), loginPath: '/login' })
guard('/account') // true | { redirect: '/login?returnTo=%2Faccount' }`,
      mistakes: ['Trusting a `returnTo` query param directly — run it through `safeReturnTo`'],
      seeAlso: ['safeReturnTo'],
    },
    {
      name: 'safeReturnTo',
      kind: 'function',
      signature: '(value: string | null | undefined, fallback?: string) => string',
      summary:
        'Open-redirect guard for a `returnTo` value: returns the value only when it is a same-origin path, else `fallback` (default `/`). It rejects `//`, backslashes and every control character (browsers strip tab/CR/LF before parsing), confirms the value resolves to the same origin under the WHATWG URL parser, and rejects a path that RESOLVES (dot segments) or DECODES (`%2F%2F`, `%5C`, double-encoded) to a protocol-relative `//host`. Returns the normalised path.',
      example: `const to = safeReturnTo(new URL(req.url).searchParams.get('returnTo'))
return Response.redirect(new URL(to, req.url), 303)`,
      mistakes: ['Checking only `startsWith("/")` — `//evil.example`, `/\\evil.example` and `/a/../..//evil.example` all leave the site'],
      seeAlso: ['createGuard'],
    },
    {
      name: 'createFlowBinding',
      kind: 'function',
      signature: '(cookieHeader?: string | null, opts?: { name?: string }) => { value: string; setCookie: string }',
      summary:
        'Server side (backend-for-frontend): the browser binding to start a sign-in with, and the `Set-Cookie` header for it — a random value in a `__Host-` cookie (HttpOnly, Secure, SameSite=Lax, 10 minutes). Pass `value` as `createAuth({ binding })` and send `setCookie` with the redirect to the provider. It reuses the binding the request already carries, so sign-ins started in two tabs do not invalidate each other. Without it, an attacker can start a sign-in, finish it at the provider as themselves and send the callback URL to a victim, who is then signed in to the attacker\'s account (login CSRF; PKCE does not help because the verifier is on your server).',
      example: `const binding = createFlowBinding(req.headers.get('cookie'))
const auth = createAuth({ issuer, client, flows, binding: binding.value, redirect: (url) => (location = url) })
await auth.signIn()
return new Response(null, { status: 302, headers: { location, 'set-cookie': binding.setCookie } })`,
      mistakes: ['Using one constant binding for every request — that binds nothing; it must come from the requesting browser\'s cookie'],
      seeAlso: ['readFlowBinding', 'createAuth'],
    },
    {
      name: 'readFlowBinding',
      kind: 'function',
      signature: '(cookieHeader: string | null | undefined, opts?: { name?: string }) => string | null',
      summary:
        'Server side: the browser binding a callback request carries (set by `createFlowBinding` when the sign-in started), or null. Pass it as `createAuth({ binding })` on the callback route, or to `parseCallback`; a null binding fails the callback with `unbound_flow`, as does a callback opened in a different browser.',
      example: `const auth = createAuth({ issuer, client, flows, binding: readFlowBinding(req.headers.get('cookie')), redirect: () => {} })
await auth.handleCallback(req.url)`,
      mistakes: ['Falling back to a fresh binding when the cookie is missing — the callback must fail, not be re-bound to whoever presents it'],
      seeAlso: ['createFlowBinding'],
    },
    {
      name: 'memoryFlowStore',
      kind: 'function',
      signature: '() => FlowStore',
      summary:
        'In-process `FlowStore` (tests, single-process servers): flows read-and-deleted by key, expired flows dropped on save, at most 1000 held. A `FlowStore` maps opaque keys (derived from state, issuer, client id, redirect URI and browser binding) to `PendingFlow`s; with several server instances implement it over a shared store whose `take` is atomic (Redis `GETDEL`).',
      example: `const flows = memoryFlowStore()
const auth = createAuth({ issuer, client, flows, binding: createFlowBinding(cookie).value, redirect })`,
      mistakes: ['Using it behind a load balancer — a callback landing on another instance fails with `unknown_flow`'],
      seeAlso: ['createAuth', 'sessionStorageFlowStore'],
    },
    {
      name: 'AuthError',
      kind: 'class',
      signature: 'class AuthError extends Error { readonly code: string }',
      summary:
        'Every failure of the sign-in flow and token checks is an `AuthError` with a stable `code` shared by web, iOS and Android (`unknown_flow`, `unbound_flow`, `redirect_mismatch`, `redirect_shared`, `invalid_redirect_uri`, `invalid_callback`, `provider_unavailable`, `issuer_mismatch`, `state_mismatch`, `provider_error`, `network_error`, `bad_nonce`, `bad_aud`, `bad_azp`, `expired`, `not_yet_valid`, `too_old`, `no_key`, `bad_signature`, …). Messages never contain tokens, codes or verifiers. Branch on `code`, not on the message.',
      example: `try {
  parseCallback(req.url, flow, meta, binding)
} catch (e) {
  if (e instanceof AuthError && e.code === 'provider_error') showCancelled()
  else throw e
}`,
      mistakes: ['Rendering `message` as HTML — a provider error string is attacker-controlled text'],
      seeAlso: ['createAuth', 'parseCallback'],
    },
    {
      name: 'refreshTokens',
      kind: 'function',
      signature: '(meta: OidcMetadata, client: ClientConfig, refreshToken: string, fetchImpl?: FetchLike) => Promise<TokenResponse>',
      summary:
        'One refresh-token grant (public client), validated like the code exchange; the provider may rotate the refresh token, so store the one it returns. With rotation and reuse detection, never run two at once for one session — `createAuth().refresh()` already shares one in-flight request.',
      example: `const t = await refreshTokens(meta, client, session.refreshToken)
session.refreshToken = t.refresh_token ?? session.refreshToken`,
      mistakes: ['Refreshing the same token twice concurrently — a provider with reuse detection revokes the whole token family'],
      seeAlso: ['createAuth', 'exchangeCode'],
    },
    {
      name: 'endSessionUrl',
      kind: 'function',
      signature: '(meta: OidcMetadata, opts?: { idTokenHint?: string; postLogoutRedirectUri?: string; clientId?: string; state?: string }) => string | null',
      summary:
        'The RP-initiated logout URL (OpenID Connect RP-Initiated Logout 1.0), or null when the provider advertises no `end_session_endpoint`. Navigate there to end the session AT THE PROVIDER; clearing local state alone leaves the provider session alive. It does not revoke tokens (RFC 7009) — an access or refresh token already issued stays valid until it expires.',
      example: `const url = endSessionUrl(meta, { idTokenHint: tokens.id_token, postLogoutRedirectUri: 'https://app.example/' })
if (url) location.assign(url)`,
      mistakes: ['Expecting it to revoke tokens — it ends the provider session; `createAuth().signOut()` revokes them (RFC 7009) when the provider advertises a revocation_endpoint, or call `revokeToken`'],
      seeAlso: ['createAuth', 'revokeToken'],
    },
    {
      name: 'revokeToken',
      kind: 'function',
      signature: "(meta: OidcMetadata, client: { clientId: string }, token: string, opts?: { tokenTypeHint?: 'refresh_token' | 'access_token'; fetch?: FetchLike; signal?: AbortSignal }) => Promise<void>",
      summary:
        'Revoke a token at the provider (RFC 7009) as a public client (`client_id`, no secret), over https only. Revoking the refresh token also ends the access tokens of its grant at most providers. The provider answers 200 for a token it does not know, so success means "no longer usable". Throws `no_revocation_endpoint` when discovery advertised none, `provider_unavailable` on 429 / 5xx, `revocation_failed` on any other refusal, `network_error` when unreachable. `createAuth().signOut()` calls it for you.',
      example: `if (meta.revocation_endpoint) await revokeToken(meta, { clientId: 'app' }, tokens.refresh_token, { tokenTypeHint: 'refresh_token' })`,
      mistakes: ['Revoking only the access token — the refresh token keeps minting new ones; revoke the refresh token'],
      seeAlso: ['createAuth', 'endSessionUrl'],
    },
    {
      name: 'createJwksCache',
      kind: 'function',
      signature: '(meta: OidcMetadata, fetchImpl?: FetchLike, opts?: JwksCacheOptions) => JwksCache',
      summary:
        'A provider\'s JWKS, cached for `maxAgeMs` (default 1 hour). Concurrent callers share one in-flight fetch, a failed fetch is not cached, and an unknown `kid` (or, through `verifyIdToken`, a token that fails against the cached keys) triggers a re-fetch throttled to one per `minRefreshMs` (default 60 s), so key rotation needs no restart and forged tokens cannot flood the provider. Pass the cache straight to `verifyIdToken`.',
      example: `const jwks = createJwksCache(meta)
const claims = await verifyIdToken(idToken, jwks, meta, { clientId: 'bff', nonce })`,
      mistakes: ['Creating a cache per request — it then fetches the JWKS on every verification'],
      seeAlso: ['verifyIdToken'],
    },
    {
      name: 'google',
      kind: 'constant',
      signature: 'Preset',
      summary:
        'Provider presets: `google` and `keycloak(baseUrl, realm)` are OIDC issuers (discovery) with a default scope; `withPreset(preset, client)` merges the scope into a `ClientConfig`. `github`, `facebook(version)` and `oauth2(issuer, authorize, token)` are plain OAuth2 endpoint sets for `createAuth({ metadata })`. Give each provider its own redirect URI.',
      example: `const auth = createAuth({
  issuer: google.issuer,
  client: withPreset(google, { clientId: 'app', redirectUri: 'https://app.example/auth/callback/google' }),
  flows: sessionStorageFlowStore(),
  redirect: (u) => location.assign(u),
})`,
      mistakes: ['Sharing one redirect URI between two presets — createAuth refuses it (OAuth mix-up)'],
      seeAlso: ['keycloak', 'withPreset', 'github'],
    },
    {
      name: 'keycloak',
      kind: 'function',
      signature: '(baseUrl: string, realm: string) => Preset',
      summary: 'The OIDC preset for a Keycloak realm: issuer `<baseUrl>/realms/<realm>`, discovered at sign-in.',
      example: `const kc = keycloak('https://sso.example.com', 'staff')
const auth = createAuth({ issuer: kc.issuer, client: withPreset(kc, client), flows, binding, redirect })`,
      seeAlso: ['google', 'withPreset'],
    },
    {
      name: 'withPreset',
      kind: 'function',
      signature: '(preset: Preset, client: ClientConfig) => ClientConfig',
      summary: 'Merges a preset\'s default scope into your client configuration; a `scope` you set wins.',
      example: `const client = withPreset(google, { clientId: 'app', redirectUri: 'https://app.example/auth/callback/google' })`,
      seeAlso: ['google', 'keycloak'],
    },
    {
      name: 'facebook',
      kind: 'function',
      signature: '(version: string) => OidcMetadata',
      summary: 'Facebook Login endpoints for a pinned Graph API version (plain OAuth2: no ID token). Use with `createAuth({ metadata })`.',
      example: `const auth = createAuth({ metadata: facebook('v20.0'), client, flows, binding, redirect })`,
      seeAlso: ['github', 'oauth2'],
    },
    {
      name: 'oauth2',
      kind: 'function',
      signature: '(issuer: string, authorizationEndpoint: string, tokenEndpoint: string) => OidcMetadata',
      summary: 'Endpoints for any plain OAuth2 provider (no discovery, no ID token). The endpoints must be https (loopback http for development) — checked where they are used.',
      example: `const meta = oauth2('https://git.example', 'https://git.example/oauth/authorize', 'https://git.example/oauth/token')`,
      seeAlso: ['github', 'facebook'],
    },
    {
      name: 'verifyTotpWithMigration',
      kind: 'function',
      signature: '(secret: string, code: string, opts?: { period?: number; digits?: number; now?: number; window?: number; lastUsedStep?: number }) => Promise<{ ok: true; step: number; reEnrol: string | null } | { ok: false }>',
      summary:
        'The way off legacy 80-bit TOTP enrolments: `verifyTotp` with 80-bit secrets allowed, returning `reEnrol` — a fresh 160-bit secret — when the stored secret is under 128 bits (null otherwise), so it can replace `verifyTotp` for every user while old enrolments drain. Show `reEnrol` as a new setup key, confirm a code with `verifyTotp(reEnrol, code)`, and only then replace the stored secret.',
      example: `const r = await verifyTotpWithMigration(user.totpSecret, input, { lastUsedStep: user.lastTotpStep })
if (r.ok && r.reEnrol) await offerReEnrolment(r.reEnrol) // swap the secret only after the user proves it`,
      mistakes: ['Replacing the stored secret as soon as `reEnrol` is returned — a user who never scans it is locked out; swap only after a code from the new secret verifies'],
      seeAlso: ['verifyTotp', 'generateTotpSecret'],
    },
    {
      name: 'totp',
      kind: 'function',
      signature: '(secret: string, opts?: { period?: number; digits?: number; allowShortSecret?: boolean; now?: number }) => Promise<string>',
      summary: 'The current RFC 6238 code for a base32 secret, with the same `period` / `digits` / `allowShortSecret` options `verifyTotp` takes (defaults 30 s, 6 digits, at least 128-bit secrets).',
      example: `const code = await totp(secret)`,
      seeAlso: ['verifyTotp', 'generateTotpSecret'],
    },
    {
      name: 'generateTotpSecret',
      kind: 'function',
      signature: '() => string',
      summary: 'A fresh 160-bit TOTP secret, base32 — the setup key or QR payload an authenticator app scans. Store it server-side, encrypted at rest.',
      example: `const secret = generateTotpSecret()
const otpauth = \`otpauth://totp/App:\${email}?secret=\${secret}&issuer=App\``,
      seeAlso: ['verifyTotp', 'totp'],
    },
    {
      name: 'passkeyChallenge',
      kind: 'function',
      signature: '() => string',
      summary: 'A fresh 32-byte random WebAuthn challenge (base64url). Store it server-side for the ceremony and use it once.',
      example: `const challenge = passkeyChallenge()
await store.set(userId, challenge)`,
      mistakes: ['Reusing a challenge — each ceremony needs a new one, consumed on verification'],
      seeAlso: ['verifyAssertion', 'verifyRegistration'],
    },
    {
      name: 'sessionCookie',
      kind: 'function',
      signature: '(name: string, value: string, maxAge?: number) => string',
      summary:
        'A `Set-Cookie` header value with secure attributes: `__Host-` prefix, Path=/, HttpOnly, Secure, SameSite=Lax, Max-Age (default 8 h). Throws on a name that is not a cookie token, a value with spaces, quotes, commas, semicolons or backslashes, or a negative or fractional Max-Age — anything that could inject attributes.',
      example: `const value = await signSession({ sub: user.id }, opts)
headers.set('set-cookie', sessionCookie('session', value))`,
      seeAlso: ['signSession', 'verifySession'],
    },
    {
      name: 'generateCodeVerifier',
      kind: 'function',
      signature: '() => string',
      summary: 'A 43-character PKCE code verifier (32 random bytes, base64url) — the RFC 7636 minimum length. `codeChallengeS256(verifier)` gives its S256 challenge. `beginAuthorization` uses both; call them yourself only for a custom flow or a test provider.',
      example: `const verifier = generateCodeVerifier()
const challenge = await codeChallengeS256(verifier)`,
      seeAlso: ['codeChallengeS256', 'beginAuthorization'],
    },
    {
      name: 'codeChallengeS256',
      kind: 'function',
      signature: '(verifier: string) => Promise<string>',
      summary: 'The S256 PKCE challenge of a verifier: base64url(SHA-256(verifier)). `plain` is deliberately not offered (RFC 9700 §2.1.1).',
      example: `const challenge = await codeChallengeS256(generateCodeVerifier())`,
      seeAlso: ['generateCodeVerifier'],
    },
  ],
  multiplatform: {
    tier: 'service-backend',
    rationale:
      'useOidc lowers to the native OIDC session container (PyreonOidcAuth, co-sourced Swift/Kotlin): system browser (ASWebAuthenticationSession / Custom Tab), PKCE, the code exchange, ID-token verification against the provider keys, refresh and provider logout, with the session kept in the Keychain / Keystore. The lower-level API (createAuth, sessions, TOTP, passkeys, guards) is web/server code',
  },
})
