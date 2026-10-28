---
title: "Authentication — API Reference"
description: "OIDC sign-in on web, iOS and Android, ID-token verification, sessions, TOTP and passkeys — secure by default"
---

# @pyreon/auth — API Reference

> **Generated** from `auth`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [auth](/docs/auth).

Authentication primitives for Pyreon on Web Crypto + fetch (browsers, Node, Bun, workerd): OIDC/OAuth2 authorization code with S256 PKCE, state, nonce and the RFC 9207 `iss` check; ID-token verification against a cached, rotation-aware JWKS; a reactive `createAuth` state machine with refresh and RP-initiated logout; HMAC cookie sessions with revocation; TOTP; ES256 and RS256 passkeys; an attempt limiter; and an open-redirect-safe route guard. Interop-tested against oidc-provider, a certified OpenID Provider.

## Multiplatform

**Tier:** Service backend — the API is shared; the native runtimes host it

useOidc lowers to the native OIDC session container (PyreonOidcAuth, co-sourced Swift/Kotlin): system browser (ASWebAuthenticationSession / Custom Tab), PKCE, the code exchange, ID-token verification against the provider keys, refresh and provider logout, with the session kept in the Keychain / Keystore. The lower-level API (createAuth, sessions, TOTP, passkeys, guards) is web/server code

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- S256 PKCE only — `plain`, the implicit flow and the password grant are deliberately not offered
- state + nonce + RFC 9207 `iss` check on every callback; flows expire after 10 minutes
- Discovery refuses a non-https issuer, a non-https endpoint, or an issuer that does not equal the fetched URL
- Guard `returnTo` only round-trips same-origin relative paths
- Refresh can never switch users; signOut can end the session at the provider

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useOidc`](#useoidc-hook) | hook | A reactive OIDC sign-in with the SAME surface on web, iOS and Android — the shared-source entry point. |
| [`sessionStorageFlowStore`](#sessionstorageflowstore-function) | function | The browser flow store `useOidc` uses by default: pending sign-ins (state, nonce, PKCE verifier) in `sessionStorage`, re |
| [`beginAuthorization`](#beginauthorization-function) | function | Builds the authorization redirect (code flow, S256 PKCE, state, nonce) and returns the `PendingFlow` that must survive t |
| [`parseCallback`](#parsecallback-function) | function | Validates the redirect back from the provider in a fixed order — expiry, provider error, state, `iss` (RFC 9207), then t |
| [`exchangeCode`](#exchangecode-function) | function | Exchanges the authorization code using the PKCE verifier (public client, no secret) and rejects anything that is not a b |
| [`discover`](#discover-function) | function | Fetches OIDC discovery and validates it: https-only (loopback http allowed for dev), the document issuer must equal the  |
| [`createAuth`](#createauth-function) | function | Reactive auth state machine over the OIDC primitives. |
| [`signSession`](#signsession-function) | function | Signs a session into a cookie-safe `body.signature` string (HMAC-SHA256 over Web Crypto). |
| [`verifySession`](#verifysession-function) | function | Verifies a `signSession` value: HMAC against each secret in turn (rotation), then expiry and `sub`. |
| [`createAttemptLimiter`](#createattemptlimiter-function) | function | Fixed-window attempt limiter for brute-forceable checks (TOTP codes, passkey and password attempts): at most `max` attem |
| [`github`](#github-constant) | constant | Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). |
| [`verifyIdToken`](#verifyidtoken-function) | function | Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refuse |
| [`runStrategy`](#runstrategy-function) | function | Passport bridge (`@pyreon/auth/passport`, server only). |
| [`verifyTotp`](#verifytotp-function) | function | RFC 6238 TOTP second factor (HMAC-SHA1, 6 digits, 30 s) on Web Crypto, verified against the RFC test vectors and compati |
| [`verifyAssertion`](#verifyassertion-function) | function | Server-side WebAuthn sign-in (passkey assertion) verification for ES256 and RS256 credentials on Web Crypto; the type of |
| [`verifyRegistration`](#verifyregistration-function) | function | Server-side WebAuthn passkey registration for ES256 (P-256) and RS256 (RSA &gt;= 2048 bits, used by Windows Hello) credenti |
| [`createGuard`](#createguard-function) | function | Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `return |

## API

### `useOidc` `hook`

```ts
(opts: UseOidcOptions) => UseOidcResult
```

A reactive OIDC sign-in with the SAME surface on web, iOS and Android — the shared-source entry point. Every member is read as a call (`auth.status()`, `auth.subject()`, `auth.claim("email")`, `auth.accessToken()`, `auth.expiresAt()`, `auth.error()`, `auth.isAuthenticated()`), and the strings it returns (status spellings, error codes) are identical on all three targets. On the web it is `createAuth` with browser defaults: pending sign-ins in `sessionStorage` (they must survive the full-page round trip), navigation by `location.assign`, and on the redirect page the callback is completed automatically, with the code scrubbed from the address bar and history first. In shared source it lowers to the native `PyreonOidcAuth`, which runs the system browser, verifies the ID token against the provider keys, refreshes, and keeps the session in the Keychain / Keystore so the app is still signed in after a relaunch. Persistence is the one deliberate divergence: the web holds tokens in memory only, so a reload starts at `signedOut` — storing them in `localStorage` / `sessionStorage` would make any XSS bug a stolen long-lived session. Re-run `signIn()` on load (it completes without a prompt while the provider session lasts) or keep the session server-side behind an HttpOnly cookie (`signSession`). Options must be static (literals or module consts) because native bakes them in. Call it ONCE at the app root and pass `auth` down.

**Example**

```tsx
const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback',
  nativeRedirectUri: 'com.example.app:/oauth',
  scope: 'openid profile email offline_access',
})
// <Button onPress={() => auth.signIn()}>Sign in</Button>
// <Text>{auth.isAuthenticated() ? auth.claim('email') : auth.status()}</Text>
```

**Common mistakes**

- Omitting `nativeRedirectUri` — a native app cannot receive a redirect to the web page unless it is a claimed universal link / App Link; register an app-scheme redirect with the provider
- Calling useOidc in several components — each call is its own session object; create one at the root and pass it down
- Building the options at runtime (a prop, a fetch result) — native bakes them at compile time; the call is reported and not emitted
- Reading `auth.status` without calling it — every member is a call on the web
- Expecting a refresh token without `offline_access` in `scope` (and, for Google, `authorizationParams: { access_type: "offline", prompt: "consent" }`)
- Forgetting the Android manifest entries for PyreonAuthActivity / PyreonAuthRedirectActivity — without them the redirect never returns to the app
- Expecting the web session to survive a reload like native does — web tokens live in memory only; re-run `signIn()` on load or keep the session server-side behind an HttpOnly cookie, never in `localStorage`

**See also:** `createAuth` · `sessionStorageFlowStore`

---

### `sessionStorageFlowStore` `function`

```ts
(storage?: Storage) => FlowStore
```

The browser flow store `useOidc` uses by default: pending sign-ins (state, nonce, PKCE verifier) in `sessionStorage`, read-and-deleted, with expired and excess entries swept on save. A browser sign-in is a full page load to the provider and back, so an in-memory store is empty when the user returns and every callback fails with `unknown_flow`; `sessionStorage` survives the round trip and is cleared when the tab closes.

**Example**

```tsx
const auth = createAuth({ issuer, client, flows: sessionStorageFlowStore(), redirect: (u) => location.assign(u) })
```

**Common mistakes**

- Using memoryFlowStore() with a browser redirect — the page reload empties it; use this store (or useOidc, which defaults to it)
- Backing flows with localStorage — it outlives the tab and is shared across tabs; sessionStorage is the standard place for a browser client's pending authorization

**See also:** `useOidc` · `createAuth`

---

### `beginAuthorization` `function`

```ts
(meta: OidcMetadata, client: ClientConfig, now?: number) => Promise<{ url: string; flow: PendingFlow }>
```

Builds the authorization redirect (code flow, S256 PKCE, state, nonce) and returns the `PendingFlow` that must survive the round trip. Persist the flow server-side or in a short-lived HttpOnly cookie — never in localStorage — and delete it after the callback whether or not it succeeded.

**Example**

```tsx
const meta = await discover('https://accounts.example')
const { url, flow } = await beginAuthorization(meta, { clientId: 'app', redirectUri: 'https://app.example/cb' })
// store `flow`, then redirect the user to `url`
```

**Common mistakes**

- Storing the PendingFlow in localStorage — it holds the PKCE verifier; keep it server-side or in an HttpOnly cookie
- Reusing a flow for a second callback — it is single-use; delete it after the first attempt

**See also:** `parseCallback` · `exchangeCode` · `discover`

---

### `parseCallback` `function`

```ts
(callback: string | URL, flow: PendingFlow, meta: OidcMetadata, now?: number) => { code: string }
```

Validates the redirect back from the provider in a fixed order — expiry, provider error, state, `iss` (RFC 9207), then the code — and throws an `AuthError` with a stable `code` on any failure.

**Example**

```tsx
const { code } = parseCallback(req.url, flow, meta)
```

**Common mistakes**

- Catching AuthError and continuing — every failure means the attempt is untrusted

**See also:** `beginAuthorization` · `exchangeCode`

---

### `exchangeCode` `function`

```ts
(meta: OidcMetadata, client: ClientConfig, flow: PendingFlow, code: string, fetchImpl?: FetchLike) => Promise<TokenResponse>
```

Exchanges the authorization code using the PKCE verifier (public client, no secret) and rejects anything that is not a bearer token response. Redirects from the token endpoint are refused.

**Example**

```tsx
const tokens = await exchangeCode(meta, client, flow, code)
```

**Common mistakes**

- Sending a client secret from a browser or native app — public clients rely on PKCE

**See also:** `parseCallback`

---

### `discover` `function`

```ts
(issuer: string, fetchImpl?: FetchLike) => Promise<OidcMetadata>
```

Fetches OIDC discovery and validates it: https-only (loopback http allowed for dev), the document issuer must equal the issuer you asked for (OIDC Discovery §4.3), and the authorization and token endpoints must be https. Never pass a user-supplied issuer without an allowlist — discovery is an SSRF vector.

**Example**

```tsx
const meta = await discover('https://accounts.example')
```

**Common mistakes**

- Passing a user-controlled issuer URL — allowlist issuers on the server

**See also:** `beginAuthorization`

---

### `createAuth` `function`

```ts
(opts: AuthOptions) => Auth
```

Reactive auth state machine over the OIDC primitives. Exposes `status` (signedOut | signingIn | signedIn | error), `tokens`, `claims`, `expiresAt` and `error` as signals plus `signIn`, `handleCallback`, `refresh` and `signOut`. Keys come from a cached JWKS that is re-fetched (throttled) when a token names an unknown `kid`, so provider key rotation needs no restart. `refresh()` keeps the old refresh token when the provider does not rotate it and refuses a refreshed ID token with a different `sub`. `signOut({ endProviderSession: true })` also redirects to the `end_session_endpoint` of the provider with an `id_token_hint`; plain `signOut()` clears local state only. When the provider returns an ID token, `handleCallback` verifies it (signature against the provider JWKS, iss/aud/exp/nbf and this flow's nonce) BEFORE reporting `signedIn`, and exposes the verified payload as `claims`; a provider that returns an ID token but publishes no `jwks_uri` is refused. An epoch counter guarantees a late token exchange can never resurrect a session after `signOut()`; pending flows are read-and-deleted from the `FlowStore` so a callback URL cannot be replayed, and `memoryFlowStore` drops abandoned flows after the 10-minute flow lifetime.

**Example**

```tsx
const auth = createAuth({ issuer: google.issuer, client, flows, redirect: (u) => location.assign(u) })
await auth.signIn()
// on the callback route:
await auth.handleCallback(location.href)
```

**Common mistakes**

- Backing the FlowStore with localStorage — it holds the PKCE verifier; use a server store or an HttpOnly cookie
- Reading `auth.status` without calling it — it is a signal
- Reading identity from `auth.tokens()?.id_token` — that is the raw token; use the verified `auth.claims()`
- Expecting a refresh token without asking for one — request `offline_access`, and pass provider params via `client.authorizationParams` (Google: `access_type: offline`)
- Calling `signOut()` and expecting the next sign-in to prompt — the provider session survives; use `signOut({ endProviderSession: true })`
- Using `memoryFlowStore` behind a load balancer — a callback landing on another instance fails with `unknown_flow`; back `FlowStore` with a shared store

**See also:** `beginAuthorization` · `google` · `keycloak`

---

### `signSession` `function`

```ts
(payload: SessionPayload, opts: SessionOptions, now?: number) => Promise<string>
```

Signs a session into a cookie-safe `body.signature` string (HMAC-SHA256 over Web Crypto). Expiry lives inside the signed body, secrets must be at least 32 characters and rotate via a list (first signs, all verify), and values over 4096 bytes are refused. `verifySession` returns null — never throws — for tampered, expired or malformed input. Pair with `sessionCookie` for HttpOnly + Secure + SameSite=Lax + `__Host-` attributes.

**Example**

```tsx
const cookie = sessionCookie('session', await signSession({ sub: user.id }, { secrets: [process.env.SESSION_SECRET!] }))
const session = await verifySession(value, { secrets: [process.env.SESSION_SECRET!] })
```

**Common mistakes**

- Putting the whole user profile in the cookie — it is capped at 4096 bytes; store a session id and look the rest up
- Replacing the secret instead of prepending it — existing sessions are invalidated; rotate by putting the new secret first

**See also:** `verifySession` · `sessionCookie`

---

### `verifySession` `function`

```ts
(value: string, opts: SessionOptions, now?: number) => Promise<SessionPayload | null>
```

Verifies a `signSession` value: HMAC against each secret in turn (rotation), then expiry and `sub`. Returns null — never throws — for anything invalid. A signed cookie is otherwise valid until it expires, so pass `isRevoked(jti, payload)` (sync or async) to make sessions revocable: every session carries a random `jti`, and a revoked one is rejected after the signature passes. Keep revoked ids until their `exp`, then drop them.

**Example**

```tsx
const session = await verifySession(cookie, {
  secrets: [process.env.SESSION_SECRET!],
  isRevoked: (jti) => revoked.has(jti),
})
```

**Common mistakes**

- Treating logout as "delete the cookie" — a copied cookie stays valid until it expires unless you check `isRevoked`
- Keeping revoked ids forever — they are only needed until the session would have expired

**See also:** `signSession`

---

### `createAttemptLimiter` `function`

```ts
(opts?: AttemptLimiterOptions) => AttemptLimiter
```

Fixed-window attempt limiter for brute-forceable checks (TOTP codes, passkey and password attempts): at most `max` attempts per `windowMs` per key, reporting `retryAfterMs` when exhausted; call `reset(key)` after a success. Per process and bounded — expired windows are dropped as they are touched and the table never exceeds `maxKeys`, so a flood of distinct keys cannot grow it without limit. Eviction never frees a blocked key: a full table drops an expired window, else the active window with the fewest attempts, never one at its limit; when every slot is at its limit the NEW key is refused (fail closed), so a key flood can delay first attempts from new keys but never buys a blocked key more guesses — size `maxKeys` above the keys legitimately active in one window. Run several instances? Keep the same counters in a shared store.

**Example**

```tsx
const limiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60_000 })
const gate = limiter.attempt(userId)
if (!gate.allowed) return tooManyRequests(gate.retryAfterMs)
const r = await verifyTotp(secret, code, { lastUsedStep })
if (r.ok) limiter.reset(userId)
```

**Common mistakes**

- Keying only by IP — an attacker rotates addresses; key by account as well
- Relying on it across instances — each process counts separately
- Setting `maxKeys` near the number of keys legitimately active in one window — a full table of blocked windows refuses new keys until the oldest window ends

**See also:** `verifyTotp` · `verifyAssertion`

---

### `github` `constant`

```ts
OidcMetadata
```

Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). `facebook(version)` and `oauth2(issuer, authorize, token)` cover other plain OAuth2 providers. Pass as `createAuth({ metadata })` to skip discovery. Explicit endpoints are checked where they are used: the authorization and token endpoints must be https (loopback http allowed for local development) or the call fails with `insecure_url`, on web, iOS and Android alike. Pin the Facebook Graph version you have tested.

**Example**

```tsx
const auth = createAuth({ metadata: github, client, flows, redirect })
```

**Common mistakes**

- Expecting an `id_token` from a non-OIDC provider — fetch the profile with the access token instead

**See also:** `createAuth` · `google` · `keycloak`

---

### `verifyIdToken` `function`

```ts
(token: string, keys: readonly Jwk[], meta: OidcMetadata, opts: VerifyOptions) => Promise<IdTokenClaims>
```

Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refused to rule out algorithm confusion), signature against the provider JWKS key chosen by `kid` and the header alg, then `iss`, `aud` (+ `azp` for multi-audience tokens), `exp` and `nbf` with 60 s skew, `sub` and the `nonce` you stored in the pending flow. A token declaring `crit` header extensions is refused (none are understood), and malformed input fails with an `AuthError`, never a raw TypeError. Fetch keys with `fetchJwks(meta)` and cache them server-side; call this on the server, never trust an unverified `id_token`.

**Example**

```tsx
const keys = await fetchJwks(meta)
const claims = await verifyIdToken(tokens.id_token!, keys, meta, { clientId: client.clientId, nonce: flow.nonce })
```

**Common mistakes**

- Decoding the id_token payload without verifying the signature — anyone can forge it
- Skipping the nonce — it binds the token to this login attempt and defeats replay
- Refetching the JWKS on every request — cache it and refresh only on an unknown `kid`

**See also:** `fetchJwks` · `exchangeCode`

---

### `runStrategy` `function`

```ts
(strategy: PassportStrategyLike, input: PassportInput, options?: Record<string, unknown>) => Promise<PassportOutcome>
```

Passport bridge (`@pyreon/auth/passport`, server only). Runs any Passport strategy — passport-local, passport-oauth2, Keycloak, SAML — without Express or the `passport` package: the strategy is cloned, its `success/fail/redirect/pass/error` hooks are bound to a promise, and the result is a discriminated outcome. Strategies that keep OAuth state in `req.session` write it into the `session` object you pass, so back that with the pending-flow store. Rejects only when the strategy calls `error()` or throws.

**Example**

```tsx
import { runStrategy } from '@pyreon/auth/passport'
const out = await runStrategy(new LocalStrategy(verify), { method: 'POST', url: '/login', body })
if (out.type === 'success') startSession(out.user)
```

**Common mistakes**

- Passing a shared `session` object across users — create one per attempt, it carries OAuth state/verifier
- Treating `fail` as an exception — it is a normal outcome (bad credentials); only `error` rejects

**See also:** `createAuth` · `signSession`

---

### `verifyTotp` `function`

```ts
(secret: string, code: string, opts?: { now?: number; window?: number; lastUsedStep?: number | undefined }) => Promise<{ ok: true; step: number } | { ok: false }>
```

RFC 6238 TOTP second factor (HMAC-SHA1, 6 digits, 30 s) on Web Crypto, verified against the RFC test vectors and compatible with Google Authenticator. Accepts +/-1 step by default and returns the matched step so you can persist it and pass it back as lastUsedStep, which is what rejects replay of a code inside its window. generateTotpSecret() makes a 160-bit base32 setup key; totp() generates a code.

**Example**

```tsx
const r = await verifyTotp(user.totpSecret, input, { lastUsedStep: user.lastTotpStep })
if (r.ok) await save({ lastTotpStep: r.step })
```

**Common mistakes**

- Not storing the returned step: without lastUsedStep a captured code can be replayed for up to 90 s
- Rate-limiting nothing: six digits is brute-forceable, so limit attempts per account before calling this

**See also:** `createAttemptLimiter` · `signSession`

---

### `verifyAssertion` `function`

```ts
(a: AssertionInput, e: AssertionExpectations) => Promise<AssertionResult>
```

Server-side WebAuthn sign-in (passkey assertion) verification for ES256 and RS256 credentials on Web Crypto; the type of the STORED key picks the algorithm, never the assertion. Checks ceremony type, the single-use challenge from passkeyChallenge(), exact origin, a top-level (not cross-origin iframe) ceremony unless `allowCrossOrigin` is set, the rpId hash, user presence, user verification (required by default), a strictly increasing signCount (cloned-authenticator signal) and the ECDSA signature over authenticatorData || SHA-256(clientDataJSON), converting an ES256 DER signature to the raw form WebCrypto expects (RS256 signatures are used as-is). Returns &#123; ok: false, reason &#125; instead of throwing. Pass the JWK `verifyRegistration` returned.

**Example**

```tsx
const challenge = passkeyChallenge() // store server-side, single use
const r = await verifyAssertion(body, { challenge, origin: 'https://app.example', rpId: 'app.example', publicKey: cred.jwk, signCount: cred.signCount })
if (r.ok) await save({ signCount: r.signCount })
```

**Common mistakes**

- Reusing a challenge: it must be generated per attempt and deleted after verification
- Skipping the stored signCount update: it is what detects a cloned authenticator
- Verifying against a wrong or wildcard origin: it must equal your exact origin

**See also:** `verifyRegistration` · `createAttemptLimiter`

---

### `verifyRegistration` `function`

```ts
(r: RegistrationInput, e: RegistrationExpectations) => Promise<RegistrationResult>
```

Server-side WebAuthn passkey registration for ES256 (P-256) and RS256 (RSA &gt;= 2048 bits, used by Windows Hello) credentials with none attestation, which is what passkey providers send by default. Decodes the attestation object with a built-in minimal CBOR reader, checks ceremony type, single-use challenge, exact origin, a top-level ceremony (`allowCrossOrigin` opts in to iframes), rpId hash, user presence/verification and attested-credential data, and converts the COSE key to a JWK (EC points validated on the curve; the key type is pinned to the algorithm) that verifyAssertion accepts directly. Any other attestation format or algorithm is refused with a reason rather than silently trusted.

**Example**

```tsx
const r = await verifyRegistration(body, { challenge, origin: 'https://app.example', rpId: 'app.example' })
if (r.ok) await db.credentials.insert({ id: r.credentialId, jwk: r.publicKey, signCount: r.signCount })
```

**Common mistakes**

- Accepting packed/tpm attestation without verifying the statement: this function refuses them instead of trusting them
- Storing the credential id and key without the user id: bind the credential to the signed-in account before saving
- Requesting only alg -7 from the browser: add -257 (RS256) to pubKeyCredParams or Windows Hello cannot register

**See also:** `verifyAssertion` · `passkeyChallenge`

---

### `createGuard` `function`

```ts
<S>(opts: GuardOptions<S>) => (path: string) => GuardResult
```

Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `returnTo`. Adapt it to a router `beforeEnter`. `safeReturnTo` accepts only a same-origin path: it rejects `//`, backslashes and every control character (browsers strip tab/CR/LF before parsing, so `/\t/evil.example` would otherwise navigate to `//evil.example`), then confirms the value resolves to the same origin under the WHATWG URL parser.

**Example**

```tsx
const guard = createGuard({ session: () => user(), loginPath: '/login' })
guard('/account') // true | { redirect: '/login?returnTo=%2Faccount' }
```

**Common mistakes**

- Trusting a `returnTo` query param directly — run it through `safeReturnTo`

**See also:** `safeReturnTo`

---
