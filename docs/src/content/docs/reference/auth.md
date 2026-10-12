---
title: "Authentication — API Reference"
description: "OIDC/OAuth2 authorization-code + PKCE primitives and route guards — secure by default"
---

# @pyreon/auth — API Reference

> **Generated** from `auth`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest.

Authentication primitives for Pyreon. Phase 1a ships the framework-neutral core: S256-only PKCE, state + nonce, RFC 9207 `iss` mix-up protection, https-only OIDC discovery with issuer equality, a single-use short-lived pending flow, a public-client code exchange, and a route guard with an open-redirect-safe `returnTo`. Everything runs on Web Crypto + fetch, so it works in browsers, Node, Bun and workerd. Reactive state, session cookies, provider presets and the native runtime land in later phases.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

phase 1a is the TypeScript core only; the Swift/Kotlin runtime service containers (secure storage, system-browser round trip) land in phase 2 per the auth package plan

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- S256 PKCE only — `plain`, the implicit flow and the password grant are deliberately not offered
- state + nonce + RFC 9207 `iss` check on every callback; flows expire after 10 minutes
- Discovery refuses a non-https issuer, a non-https endpoint, or an issuer that does not equal the fetched URL
- Guard `returnTo` only round-trips same-origin relative paths

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`beginAuthorization`](#beginauthorization-function) | function | Builds the authorization redirect (code flow, S256 PKCE, state, nonce) and returns the `PendingFlow` that must survive t |
| [`parseCallback`](#parsecallback-function) | function | Validates the redirect back from the provider in a fixed order — expiry, provider error, state, `iss` (RFC 9207), then t |
| [`exchangeCode`](#exchangecode-function) | function | Exchanges the authorization code using the PKCE verifier (public client, no secret) and rejects anything that is not a b |
| [`discover`](#discover-function) | function | Fetches OIDC discovery and validates it: https-only (loopback http allowed for dev), the document issuer must equal the  |
| [`createAuth`](#createauth-function) | function | Reactive auth state machine over the OIDC primitives. |
| [`signSession`](#signsession-function) | function | Signs a session into a cookie-safe `body.signature` string (HMAC-SHA256 over Web Crypto). |
| [`github`](#github-constant) | constant | Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). |
| [`verifyIdToken`](#verifyidtoken-function) | function | Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refuse |
| [`runStrategy`](#runstrategy-function) | function | Passport bridge (`@pyreon/auth/passport`, server only). |
| [`verifyTotp`](#verifytotp-function) | function | RFC 6238 TOTP second factor (HMAC-SHA1, 6 digits, 30 s) on Web Crypto, verified against the RFC test vectors and compati |
| [`verifyAssertion`](#verifyassertion-function) | function | Server-side WebAuthn sign-in (passkey assertion) verification for ES256 credentials on Web Crypto. |
| [`verifyRegistration`](#verifyregistration-function) | function | Server-side WebAuthn passkey registration for ES256 credentials with none attestation, which is what passkey providers s |
| [`createGuard`](#createguard-function) | function | Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `return |

## API

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

Reactive auth state machine over the OIDC primitives. Exposes `status` (signedOut | signingIn | signedIn | error), `tokens` and `error` as signals plus `signIn`, `handleCallback` and `signOut`. An epoch counter guarantees a late token exchange can never resurrect a session after `signOut()`; pending flows are read-and-deleted from the `FlowStore` so a callback URL cannot be replayed.

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

### `github` `constant`

```ts
OidcMetadata
```

Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). `facebook(version)` and `oauth2(issuer, authorize, token)` cover other plain OAuth2 providers. Pass as `createAuth({ metadata })` to skip discovery. Pin the Facebook Graph version you have tested.

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

Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refused to rule out algorithm confusion), signature against the provider JWKS key chosen by `kid` and the header alg, then `iss`, `aud` (+ `azp` for multi-audience tokens), `exp` with 60 s skew, `sub` and the `nonce` you stored in the pending flow. Fetch keys with `fetchJwks(meta)` and cache them server-side; call this on the server, never trust an unverified `id_token`.

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
(secret: string, code: string, opts?: { now?: number; window?: number; lastUsedStep?: number }) => Promise<{ ok: true; step: number } | { ok: false }>
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

**See also:** `signSession`

---

### `verifyAssertion` `function`

```ts
(a: AssertionInput, e: AssertionExpectations) => Promise<AssertionResult>
```

Server-side WebAuthn sign-in (passkey assertion) verification for ES256 credentials on Web Crypto. Checks ceremony type, the single-use challenge from passkeyChallenge(), exact origin, the rpId hash, user presence, user verification (required by default), a strictly increasing signCount (cloned-authenticator signal) and the ECDSA signature over authenticatorData || SHA-256(clientDataJSON), converting the authenticator DER signature to the raw form WebCrypto expects. Returns &#123; ok: false, reason &#125; instead of throwing. Registration and attestation parsing are a later phase: today you supply the stored P-256 JWK.

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

**See also:** `verifyTotp` · `signSession`

---

### `verifyRegistration` `function`

```ts
(r: RegistrationInput, e: RegistrationExpectations) => Promise<RegistrationResult>
```

Server-side WebAuthn passkey registration for ES256 credentials with none attestation, which is what passkey providers send by default. Decodes the attestation object with a built-in minimal CBOR reader, checks ceremony type, single-use challenge, exact origin, rpId hash, user presence/verification and attested-credential data, and converts the COSE key to a P-256 JWK (validated on the curve) that verifyAssertion accepts directly. Any other attestation format or algorithm is refused with a reason rather than silently trusted.

**Example**

```tsx
const r = await verifyRegistration(body, { challenge, origin: 'https://app.example', rpId: 'app.example' })
if (r.ok) await db.credentials.insert({ id: r.credentialId, jwk: r.publicKey, signCount: r.signCount })
```

**Common mistakes**

- Accepting packed/tpm attestation without verifying the statement: this function refuses them instead of trusting them
- Storing the credential id and key without the user id: bind the credential to the signed-in account before saving

**See also:** `verifyAssertion` · `passkeyChallenge`

---

### `createGuard` `function`

```ts
<S>(opts: GuardOptions<S>) => (path: string) => GuardResult
```

Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `returnTo`. Adapt it to a router `beforeEnter`.

**Example**

```tsx
const guard = createGuard({ session: () => user(), loginPath: '/login' })
guard('/account') // true | { redirect: '/login?returnTo=%2Faccount' }
```

**Common mistakes**

- Trusting a `returnTo` query param directly — run it through `safeReturnTo`

**See also:** `safeReturnTo`

---
