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
