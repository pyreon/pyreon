---
title: Auth
description: Sign-in with OpenID Connect on web, iOS and Android from one call — plus ID-token verification, signed sessions, TOTP, passkeys and route guards, secure by default
---

`@pyreon/auth` is authentication for Pyreon apps, built on Web Crypto and `fetch` so the same code runs in the browser, Node, Bun and Cloudflare workerd. Its centre is `useOidc` — a reactive OpenID Connect sign-in that is **one call on web, iOS and Android**. Around it sit the pieces a real product needs: ID-token verification, signed cookie sessions, two-factor codes (TOTP), passkeys, attempt limiting and an open-redirect-proof route guard.

<PackageBadge name="@pyreon/auth" href="/docs/auth" />

Everything is secure by default — S256 PKCE, `state` and `nonce`, the RFC 9207 issuer check, https-only endpoints, single-use ten-minute flows, RS256/ES256 only — and tested against [`oidc-provider`](https://github.com/panva/node-oidc-provider), a certified OpenID Provider.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/auth
```

```bash [bun]
bun add @pyreon/auth
```

```bash [pnpm]
pnpm add @pyreon/auth
```

```bash [yarn]
yarn add @pyreon/auth
```

:::

Peer dependencies: `@pyreon/reactivity`. Native apps also need `@pyreon/storage`, which holds the session in the Keychain / Keystore (scaffolded multiplatform apps already have it).

## Quick start

Register your app with the identity provider (Google, Microsoft Entra, Keycloak, Auth0, Okta, Zitadel, …) as a **public client** using the **authorization code** flow, and give it a redirect URI that is a page of your app. Then:

```tsx
// @check
import { useOidc } from '@pyreon/auth'
import { Show } from '@pyreon/core'

const auth = useOidc({
  issuer: 'https://accounts.google.com',
  clientId: 'your-client-id.apps.googleusercontent.com',
  redirectUri: 'https://app.example.com/callback',
})

export function Account() {
  return (
    <Show when={() => auth.isAuthenticated()} fallback={<button onClick={() => auth.signIn()}>Sign in</button>}>
      <p>Signed in as {() => auth.claim('email')}</p>
      <button onClick={() => auth.signOut()}>Sign out</button>
    </Show>
  )
}
```

That is the whole integration on the web. `signIn()` sends the browser to the provider; when the provider sends the user back to `/callback`, `useOidc` notices that the page that loaded **is** the redirect, removes the code from the address bar and history, and completes the sign-in itself. There is no callback handler to write.

Try it — this is the real `useOidc` against a provider running inside the page. Switch the provider into one of its misbehaving modes and sign in again to watch the check that stops it:

<Example file="./examples/auth/oidc-sign-in" title="useOidc — a full sign-in, verified end to end" />

:::tip[Call it once]
Each `useOidc` call is its own session. Create it at the app root (a module-level `const`, as above, or in your root component) and pass `auth` down or provide it through context. Two calls are two independent sessions.
:::

## What happens when you sign in

Understanding the round trip makes every option and error below obvious.

1. **Discovery.** The first call fetches `<issuer>/.well-known/openid-configuration` and checks that the document names the same issuer and that every endpoint in it is https.
2. **The authorization request.** `signIn()` generates three single-use secrets — `state` (ties the redirect to this tab), `nonce` (ties the ID token to this sign-in) and a PKCE `code_verifier` (proves the app that started the flow is the one finishing it) — stores them as a *pending flow*, and navigates to the provider with the S256 challenge of the verifier.
3. **The user signs in at the provider**, which never shares the password with your app.
4. **The redirect.** The provider sends the browser back to `redirectUri` with a short-lived `code`, the `state` and (RFC 9207) its `iss`. `useOidc` scrubs these from the URL first, then checks `state` in constant time and `iss` against the issuer — the defence against the IdP mix-up attack.
5. **The code exchange.** The app posts the `code` with the PKCE verifier to the token endpoint and receives an access token, an ID token and (if you asked for `offline_access`) a refresh token.
6. **ID-token verification.** Before anything reads as signed in, the ID token's signature is verified against the keys the provider publishes, and `iss`, `aud`, `azp`, `exp`, `nbf`, `sub` and **this flow's `nonce`** are checked. Only then does `status()` become `signedIn`.

The pending flow is single-use and expires after ten minutes. On the web it lives in `sessionStorage`, which is per-tab and survives the full-page round trip to the provider; native apps keep it in memory, because the system browser hands the redirect straight back to the running app.

PKCE in one picture — the verifier never leaves the app, only its hash goes to the provider:

<Example file="./examples/auth/pkce-explorer" title="PKCE — verifier and S256 challenge" />

## Reading the session

Every member of the result is a reactive read. Use it in JSX, `computed`, or `effect`, exactly like a signal:

| Member | Returns | Notes |
| --- | --- | --- |
| `status()` | `'signedOut' \| 'signingIn' \| 'signedIn' \| 'error'` | The same strings on web, iOS and Android, so `auth.status() === 'signedIn'` is portable. |
| `isAuthenticated()` | `boolean` | `status() === 'signedIn'`. |
| `subject()` | `string \| null` | The verified `sub` — the stable user id to key your data by. |
| `claim(name)` | `string \| null` | A verified **string** claim of the ID token: `email`, `name`, `picture`, `preferred_username`, … |
| `accessToken()` | `string \| null` | Send it to **your API** as `Authorization: Bearer …`. Never use it as proof of identity in the client. |
| `expiresAt()` | `number \| null` | When the access token expires, epoch milliseconds. |
| `error()` | `string \| null` | The last failure's code — see [Errors](#errors). Cleared by the next successful step. |
| `signIn()` | `Promise<void>` | Web: navigates to the provider. Native: opens the system browser. |
| `refresh()` | `Promise<void>` | Swap the refresh token for fresh tokens. |
| `signOut(opts?)` | `void` | Local sign-out, or provider sign-out with `{ endProviderSession: true }`. |
| `handleCallback(url)` | `Promise<void>` | Complete a sign-in from a redirect URL. `useOidc` already calls this on the redirect page. |

:::warning[Identity comes from claims, never from a raw token]
`claim()` and `subject()` only ever return values from an ID token whose signature and nonce were verified. Do not decode `accessToken()` (or a raw ID token) in the client to find out who the user is — an access token is opaque to the client by design, and a decoded-but-unverified token is attacker-controlled input.
:::

## Calling your API

There are two ways to attach the token. Use the first in code that also runs on iOS and Android; the second is a web and server convenience.

**Portable — web, iOS and Android.** Build the header inside a `useQuery` `queryFn`, and put the user in the `queryKey`:

```tsx
// @check
import { useOidc } from '@pyreon/auth'
import { useQuery } from '@pyreon/query'

type Me = { name: string; email: string }

export function useMe(auth: ReturnType<typeof useOidc>) {
  return useQuery<Me>(() => ({
    queryKey: ['me', auth.subject() ?? 'anonymous'],
    queryFn: () =>
      fetch('https://api.example.com/me', {
        headers: { authorization: `Bearer ${auth.accessToken() ?? ''}` },
      }).then((r) => r.json()),
    enabled: auth.isAuthenticated(),
  }))
}
```

- **The header is built in `queryFn`,** which runs on every fetch, so each request carries the token that is current then, including after a refresh.
- **The user is in the key,** so signing in or switching accounts refetches with the new token instead of serving the previous user's cached response.
- **The token has a fallback (`?? ''`).** `accessToken()` is `null` while signed out. The compiler refuses a header value that may be `null` and names this fix, because native headers cannot be optional and the web would send the literal text `null`.

The same source compiles to iOS and Android unchanged: the header is evaluated on the device each time the request is built.

**Web and server — `@pyreon/http` middleware.** With an `@pyreon/http` client, attach the token with the `bearer` middleware and let `refresh` renew an expired session once on a `401`:

```ts
// @check
import { useOidc } from '@pyreon/auth'
import { createHttp } from '@pyreon/http'
import { bearer, refresh } from '@pyreon/http/middleware'

const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback',
  scope: 'openid profile email offline_access',
})

export const api = createHttp({
  baseUrl: 'https://api.example.com',
  use: [
    bearer(() => auth.accessToken()),
    refresh({
      refresh: async () => {
        await auth.refresh()
        return auth.isAuthenticated() // false = give up; the user must sign in again
      },
    }),
  ],
})
```

`bearer` only attaches the token to requests that stay on `baseUrl`'s origin, so a stray absolute URL to a third party never receives it. It has no native lowering: on iOS and Android `useOidc` lives inside a component, so a module-level client has no session in scope. Use the portable form there.

On the server, validate the access token as your provider documents (a JWT access token against the provider's JWKS, or token introspection). If your provider issues ID tokens to your backend, `verifyIdToken` does the full check — see [Server-side flows](#server-side-flows).

## Staying signed in

`auth.refresh()` exchanges the refresh token for new tokens. Two rules make it safe:

- **A refresh can never switch users.** If the provider returns a new ID token, it must verify and name the same `sub`; otherwise the session is cleared with `subject_changed`.
- **Rotation is handled.** When the provider rotates the refresh token, the new one is kept; when it does not, the old one is reused.

Providers differ on when they issue a refresh token:

| Provider | What to pass |
| --- | --- |
| Most OIDC providers (Keycloak, Auth0, Okta, Zitadel, Entra) | `scope: 'openid profile email offline_access'` |
| Google | `authorizationParams: { access_type: 'offline', prompt: 'consent' }` |

A typical pattern refreshes a minute before expiry:

```ts
// @check
import { useOidc } from '@pyreon/auth'
import { effect, onCleanup } from '@pyreon/reactivity'

const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback',
  scope: 'openid profile email offline_access',
})

effect(() => {
  const at = auth.expiresAt()
  if (at === null) return
  const id = setTimeout(() => void auth.refresh(), Math.max(0, at - Date.now() - 60_000))
  onCleanup(() => clearTimeout(id))
})
```

On iOS and Android you rarely need this: the native session is restored from the Keychain / Keystore on launch, and an expired session that has a refresh token refreshes itself.

## Signing out

There are two different things a user can mean by "sign out", and they are different calls:

```ts
auth.signOut() // forget the session in THIS app
auth.signOut({ endProviderSession: true }) // also end the session at the provider
```

A local sign-out leaves the provider's own session intact, so the next `signIn()` usually completes **without a password prompt** — the provider still remembers the user. That is right for "switch back later" and wrong for a shared computer. `endProviderSession: true` sends the user to the provider's `end_session_endpoint` (OpenID Connect RP-Initiated Logout) with an `id_token_hint`, and the provider sends them back to `postLogoutRedirectUri` if you registered one:

```ts
const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback',
  postLogoutRedirectUri: 'https://app.example.com/goodbye', // register it with the provider
})
```

## Protecting routes

`createGuard` is a framework-neutral guard: it returns `true`, or a redirect to your login page carrying a **safe** `returnTo`. With `@pyreon/router`:

```ts
// @check
import { createGuard, safeReturnTo, useOidc } from '@pyreon/auth'
import { createRouter } from '@pyreon/router'

const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback',
})

const requireUser = createGuard({
  session: () => (auth.isAuthenticated() ? { sub: auth.subject() } : null),
  loginPath: '/login',
})

const requireAdmin = createGuard({
  session: () => (auth.isAuthenticated() ? { role: auth.claim('role') } : null),
  loginPath: '/login',
  allow: (s) => s.role === 'admin',
})

const Page = () => null

export const router = createRouter({
  routes: [
    { path: '/login', component: Page },
    { path: '/settings', component: Page, beforeEnter: (to) => {
      const r = requireUser(to.path)
      return r === true ? true : r.redirect
    } },
    { path: '/admin', component: Page, beforeEnter: (to) => {
      const r = requireAdmin(to.path)
      return r === true ? true : r.redirect
    } },
  ],
})

// On /login, after sign-in, go back where the user was heading — safely.
export const afterLogin = () => router.push(safeReturnTo(new URLSearchParams(location.search).get('returnTo')))
```

`returnTo` is attacker-controlled: anyone can send a victim a link to `/login?returnTo=//evil.example`. `safeReturnTo` accepts only a path that stays on your origin under the WHATWG URL parser — the parser browsers use — so it rejects every trick a hand-written prefix check misses (protocol-relative `//`, backslashes, a tab or newline the parser silently removes):

<Example file="./examples/auth/return-to-guard" title="createGuard and safeReturnTo" />

:::note[Guards are UX, the API is the gate]
A client-side guard decides what the user sees. It is not access control — your API must check the access token on every request, because the client is the user's to change.
:::

## Providers

Any OpenID Connect provider works with just its issuer. A few presets save looking up URLs:

```ts
// @check
import { createAuth, github, google, keycloak, memoryFlowStore, withPreset } from '@pyreon/auth'

// OIDC providers: the preset supplies the issuer and the default scope.
const kc = keycloak('https://sso.example.com', 'acme')
createAuth({
  issuer: kc.issuer,
  client: withPreset(kc, { clientId: 'web', redirectUri: 'https://app.example.com/cb' }),
  flows: memoryFlowStore(),
  redirect: (url) => location.assign(url),
})

createAuth({
  issuer: google.issuer,
  client: withPreset(google, {
    clientId: 'app.apps.googleusercontent.com',
    redirectUri: 'https://app.example.com/cb',
    authorizationParams: { access_type: 'offline', prompt: 'consent' },
  }),
  flows: memoryFlowStore(),
  redirect: (url) => location.assign(url),
})

// OAuth2-only providers have no discovery and no ID token: pass the endpoints.
createAuth({
  metadata: github,
  client: { clientId: 'Iv1.abc', redirectUri: 'https://app.example.com/cb', scope: 'read:user' },
  flows: memoryFlowStore(),
  redirect: (url) => location.assign(url),
})
```

| Export | Kind | Notes |
| --- | --- | --- |
| `google` | OIDC preset | `https://accounts.google.com`. |
| `keycloak(base, realm)` | OIDC preset | `https://<base>/realms/<realm>`. |
| `github` | OAuth2 metadata | No ID token: `claims()` stays `null`; fetch the user from GitHub's API with the access token. |
| `facebook(version?)` | OAuth2 metadata | Same as GitHub. |
| `oauth2(issuer, authorize, token)` | Build your own | For any other OAuth2-only provider. |

GitHub and Facebook are OAuth2, not OpenID Connect, so there is no verified identity to read — `useOidc` (which is OIDC) does not apply to them; use `createAuth` with `metadata`.

## Errors

`error()` is a short code, identical on web, iOS and Android, so one `switch` handles every platform. `status()` is `'error'` while a code is set.

| Code | When | What to do |
| --- | --- | --- |
| `cancelled` | Native: the user closed the browser before finishing. | Nothing — show the sign-in button again. |
| `provider_error` | The provider redirected back with `error=` (the user clicked Deny, consent was required, …). | Offer to try again. |
| `network_error` | A request to the provider could not be made (offline, DNS, TLS). | Retry when online. |
| `discovery_failed` | The discovery document was missing, not JSON, or lacked endpoints. | Check the `issuer` value. |
| `issuer_mismatch` | Discovery or the redirect's `iss` named a different issuer — the IdP mix-up attack. | Check the `issuer`; if it is right, the redirect was not from your provider. |
| `issuer_missing` | The provider advertises RFC 9207 but the redirect had no `iss`. | A proxy stripped the parameter, or the redirect was forged. |
| `state_mismatch` / `unknown_flow` | The redirect's `state` matched no pending sign-in of this tab. | Usually a stale or replayed redirect (back button, a second tab). Start again. |
| `flow_expired` | More than ten minutes passed between `signIn()` and the redirect. | Start again. |
| `missing_code` | The redirect carried neither a code nor an error. | Check the provider's client configuration (response type `code`). |
| `token_exchange_failed` | The token endpoint refused the code (expired, reused, wrong redirect URI, PKCE mismatch). | Check the redirect URI is registered exactly; start again. |
| `bad_token_response` | The token response was not JSON or had no bearer access token. | A provider or proxy fault. |
| `no_jwks` / `jwks_failed` | The provider published no signing keys, or they could not be fetched. | A provider fault — an ID token that cannot be verified is refused, not trusted. |
| `bad_signature` / `no_key` | The ID token was not signed by a key the provider publishes. | A forged token, or a key rotation the provider has not published yet. |
| `bad_nonce` | The ID token belongs to a different sign-in. | A replayed or injected token. Start again. |
| `bad_iss` / `bad_aud` / `bad_azp` | The token was issued by someone else or for another client. | Check `issuer` and `clientId`. |
| `expired` / `not_yet_valid` | The token's time window does not include now (±60 s). | Check the device clock. |
| `bad_alg` / `bad_token` | An unsupported algorithm (only RS256 and ES256 are accepted) or a malformed token. | — |
| `no_refresh_token` | `refresh()` without a refresh token. | Request `offline_access` (or Google's `access_type: 'offline'`). |
| `subject_changed` | A refreshed ID token named a different user. | The session is cleared; sign in again. |
| `insecure_url` / `invalid_url` | An issuer or endpoint was not https (loopback http is allowed for local development). | Fix the configuration. |
| `reserved_param` | `authorizationParams` tried to set a parameter the flow owns (`state`, `nonce`, PKCE, `redirect_uri`, …). | Remove it — those cannot be overridden. |
| `browser_failed` / `no_browser` | Native: the system browser could not be opened. | Rare; the device has no browser. |

## Server-side flows

`useOidc` is for the app the user holds. On a server — a backend-for-frontend, an SSR app that keeps tokens out of the browser — use the layer underneath.

**`createAuth`** is the same reactive state machine with every dependency explicit. On a server the pending flow must live in a store all your instances share, and `take` must read **and** delete atomically:

```ts
// @check
import { createAuth } from '@pyreon/auth'
import type { FlowStore, PendingFlow } from '@pyreon/auth'

// e.g. Redis: SET with EX on save, GETDEL on take.
declare const kv: {
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  getdel(key: string): Promise<string | null>
}

const flows: FlowStore = {
  save: (flow) => kv.set(`oidc:${flow.state}`, JSON.stringify(flow), 600),
  take: async (state) => {
    const raw = await kv.getdel(`oidc:${state}`)
    return raw ? (JSON.parse(raw) as PendingFlow) : null
  },
}

export function authFor(respond: (location: string) => void) {
  return createAuth({
    issuer: 'https://accounts.example.com',
    client: { clientId: 'bff', redirectUri: 'https://app.example.com/auth/callback' },
    flows,
    redirect: respond, // set the response's Location header
  })
}
```

The individual steps are exported too, for flows that do not fit a state machine: `discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`, `refreshTokens`, `endSessionUrl`, plus `verifyIdToken` with a rotating key cache:

```ts
// @check
import { createJwksCache, discover, tokenKid, verifyIdToken } from '@pyreon/auth'

const meta = await discover('https://accounts.example.com')
const jwks = createJwksCache(meta) // refetches once when a token names an unknown kid

export async function identify(idToken: string, expectedNonce: string) {
  const keys = await jwks.keys(tokenKid(idToken))
  const claims = await verifyIdToken(idToken, keys, meta, { clientId: 'bff', nonce: expectedNonce })
  return claims.sub
}
```

## Sessions

After a server-side sign-in, give the browser a **signed session cookie** instead of the tokens. `signSession` produces an HMAC-SHA-256 signed value with an expiry and a unique `jti`; `verifySession` returns the payload or `null`; `sessionCookie` builds a `Set-Cookie` header with the safest attributes (`__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`):

```ts
// @check
import { sessionCookie, signSession, verifySession } from '@pyreon/auth'

const opts = {
  // First secret signs; all of them verify — prepend a new one to rotate.
  secrets: [process.env.SESSION_SECRET ?? '', process.env.SESSION_SECRET_PREVIOUS ?? ''].filter(Boolean),
  maxAge: 8 * 60 * 60,
  isRevoked: (jti: string) => revoked.has(jti), // logout everywhere, a stolen device
}
const revoked = new Set<string>()

export async function startSession(sub: string): Promise<Response> {
  const value = await signSession({ sub }, opts)
  return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': sessionCookie('session', value, opts.maxAge) } })
}

export async function currentUser(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? ''
  const value = /(?:^|;\s*)__Host-session=([^;]+)/.exec(cookie)?.[1]
  return value ? ((await verifySession(value, opts))?.sub ?? null) : null
}
```

Secrets must be at least 32 characters — shorter ones throw at the first call, not at the first breach. Edit a character of a signed value, rotate the secret, or revoke the session:

<Example file="./examples/auth/signed-session" title="Signed sessions — tamper, rotate, revoke" />

## Two-factor codes (TOTP)

`generateTotpSecret`, `totp` and `verifyTotp` implement RFC 6238 — the six-digit codes of Google Authenticator, 1Password, Authy and every other authenticator app.

Enrolment: generate a secret, show it as an `otpauth://` QR code, and ask for one code to confirm the user scanned it. Verification: check the code within ±1 time step (to tolerate clock drift), and **store the matched step** so the same code cannot be used twice:

```ts
// @check
import { createAttemptLimiter, verifyTotp } from '@pyreon/auth'

const limiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60_000 })

interface User { id: string; totpSecret: string; lastTotpStep?: number }
declare function saveUser(user: User): Promise<void>

export async function checkSecondFactor(user: User, code: string): Promise<'ok' | 'wrong' | 'locked'> {
  const gate = limiter.attempt(user.id)
  if (!gate.allowed) return 'locked'
  const r = await verifyTotp(user.totpSecret, code, { lastUsedStep: user.lastTotpStep })
  if (!r.ok) return 'wrong'
  limiter.reset(user.id)
  await saveUser({ ...user, lastTotpStep: r.step }) // a code is single-use
  return 'ok'
}
```

<Example file="./examples/auth/totp-live" title="TOTP — live codes and single-use verification" />

## Limiting attempts

A six-digit code has a million values; without a limit, an attacker tries them all. `createAttemptLimiter` counts attempts per key (an account id, and an IP for unauthenticated endpoints) inside a window, and is bounded so a flood of keys cannot exhaust memory. Call `reset` after a **successful** check:

<Example file="./examples/auth/attempt-limiter" title="createAttemptLimiter" />

It is per process. With several server instances, keep the same counters in a shared store.

## Passkeys

`verifyRegistration` and `verifyAssertion` are the server half of WebAuthn passkeys, for ES256 (P-256) and RS256 (RSA ≥ 2048 bits — Windows Hello) with `none` attestation. The stored key's type decides the algorithm, never the incoming assertion.

The browser half is the standard WebAuthn API:

```ts
// Registration (browser)
const credential = (await navigator.credentials.create({
  publicKey: {
    challenge, // from passkeyChallenge() on the server, base64url-decoded
    rp: { id: 'example.com', name: 'Example' },
    user: { id: userIdBytes, name: 'ada@example.com', displayName: 'Ada' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  },
})) as PublicKeyCredential
// POST credential.rawId, response.clientDataJSON and response.attestationObject (base64url) to the server.
```

On the server, issue a fresh challenge per ceremony with `passkeyChallenge()`, then verify:

```ts
import { verifyAssertion, verifyRegistration } from '@pyreon/auth'

// Registration: store the credential on the user.
const reg = await verifyRegistration(input, {
  challenge: storedChallenge,
  origin: 'https://example.com',
  rpId: 'example.com',
})
if (!reg.ok) throw new Error(`passkey registration rejected: ${reg.reason}`)
await savePasskey(user.id, { credentialId: reg.credentialId, publicKey: reg.publicKey, signCount: reg.signCount })

// Sign-in: pass back the stored key and signCount, then store the new signCount.
const assertion = await verifyAssertion(input, {
  challenge: storedChallenge,
  origin: 'https://example.com',
  rpId: 'example.com',
  publicKey: passkey.publicKey,
  signCount: passkey.signCount,
})
if (!assertion.ok) throw new Error(`passkey sign-in rejected: ${assertion.reason}`)
await updateSignCount(passkey.credentialId, assertion.signCount)
```

User verification (biometric or PIN) is required by default (`requireUserVerification: true`). A `signCount` that fails to increase is rejected, because it signals a cloned authenticator. Ceremonies from a cross-origin iframe are refused unless you opt in with `allowCrossOrigin`. Throttle `verifyAssertion` with an attempt limiter like any other check.

## Native (iOS and Android)

`useOidc` is the shared-source entry point. In a [multiplatform](/docs/multiplatform) app the same call compiles to the native session container `PyreonOidcAuth` — SwiftUI on iOS, Compose on Android — which runs the whole flow natively:

- discovery, S256 PKCE, `state` and `nonce`;
- the system browser — `ASWebAuthenticationSession` on iOS, a Custom Tab on Android;
- the code exchange and ID-token verification against the provider's keys (RS256 / ES256), with the same checks in the same order as the web;
- refresh and provider sign-out;
- the session kept in the **Keychain / Keystore** (through `@pyreon/storage`), so the app is still signed in after a relaunch — and an expired session that has a refresh token refreshes itself on launch.

The shared component is exactly what you write for the web:

```tsx
import { useOidc } from '@pyreon/auth'
import { Button, Show, Stack, Text } from '@pyreon/primitives'

export function Account() {
  const auth = useOidc({
    issuer: 'https://accounts.example.com',
    clientId: 'app',
    redirectUri: 'https://app.example.com/callback', // web
    nativeRedirectUri: 'com.example.app:/oauth', // iOS + Android
    scope: 'openid profile email offline_access',
  })
  return (
    <Stack>
      <Show when={auth.isAuthenticated()}>
        <Text>{auth.claim('email') ?? ''}</Text>
        <Button onPress={() => auth.signOut({ endProviderSession: true })}>Sign out</Button>
      </Show>
      <Show when={auth.status() !== 'signedIn'}>
        <Button onPress={() => auth.signIn()}>Sign in</Button>
      </Show>
      <Show when={auth.error() !== null}>
        <Text>{auth.error() ?? ''}</Text>
      </Show>
    </Stack>
  )
}
```

`status()` returns the same strings and `error()` the same codes on all three targets, so comparisons like `auth.status() !== 'signedIn'` and a `switch` over `auth.error()` are portable.

### Redirect URIs for native apps

A native app cannot receive a redirect at your website's `/callback`. Register a second redirect with the provider and pass it as `nativeRedirectUri`:

- a **custom scheme** of your app — `com.example.app:/oauth` (use a reverse-DNS name you own; many providers require it); or
- a **claimed https link** — an Android App Link / iOS universal link. On iOS 17.4+ `ASWebAuthenticationSession` matches an https callback directly.

Without `nativeRedirectUri`, native apps reuse `redirectUri` and the compiler warns, because an https page of your website is rarely what a native app should receive.

### Per-platform setup

**iOS** — nothing to configure. `ASWebAuthenticationSession` hands the redirect straight back to the app; no URL-type registration is needed for the sign-in itself.

**Android** — declare two activities in `AndroidManifest.xml` (the runtime ships as sources, not an AAR, so there is no library manifest to merge), with the scheme of your `nativeRedirectUri`:

```xml
<activity
    android:name="com.pyreon.runtime.PyreonAuthActivity"
    android:exported="false"
    android:launchMode="singleTask"
    android:theme="@android:style/Theme.Translucent.NoTitleBar" />
<activity
    android:name="com.pyreon.runtime.PyreonAuthRedirectActivity"
    android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.example.app" />
  </intent-filter>
</activity>
```

`PyreonAuthActivity` opens the browser and waits; `PyreonAuthRedirectActivity` receives the provider's redirect and hands it back. If the user returns to the app without finishing (back button, closed tab), sign-in ends promptly with `cancelled` instead of hanging. A Custom Tab is used when the browser supports it, with no `androidx.browser` dependency.

### What compiles to native, and what does not

Native code bakes the configuration in at compile time, so `useOidc`'s options must be **static** — string literals or module-level `const`s:

| You write | Native result |
| --- | --- |
| `issuer`, `clientId`, `nativeRedirectUri`, `scope`, `postLogoutRedirectUri`, `authorizationParams` as literals | Baked into `PyreonOidcAuth(…)` |
| `flows`, `redirect`, `fetch` | Web-only — ignored on native, silently |
| An option read from props or computed at runtime | Warning naming the option; nothing is emitted |
| An `http://` issuer that is not loopback | Warning — native refuses it exactly as the web does |
| A reserved `authorizationParams` key (`state`, `nonce`, …) | Warning |
| `signOut({ postLogoutRedirectUri })` per call | Warning — pass it once, in the `useOidc` options |
| `` authorization: `Bearer ${auth.accessToken() ?? ''}` `` in a `useQuery` `queryFn` | Sent, built on the device for every request — see [Calling your API](#calling-your-api) |
| `bearer(() => auth.accessToken())` on an `@pyreon/http` client | Web and server only — no native lowering |

The lower-level API — `createAuth`, `discover`, `exchangeCode`, sessions, TOTP, passkeys and `createGuard` — is web and server code. A native app holds one session per `useOidc` call: create it once at the root and pass it down.

### Parity is tested, not assumed

The web, Swift and Kotlin verifiers share one answer sheet: `native/tests/vectors.json`, a set of signed ID tokens — valid ones and every rejection the verifier makes — that all three must judge identically, down to the error code. The native containers also run end to end against an in-process provider that enforces PKCE and the nonce, and the `native-tasks` example's sign-in panel is asserted on a real iOS simulator and Android emulator.

## Testing

Everything that touches the network is injectable, so a sign-in can be tested without a browser trip or a live provider. Pass your own `fetch` (a fake provider), a `memoryFlowStore()`, and a `redirect` that plays the provider's login page:

```ts
import { memoryFlowStore, useOidc } from '@pyreon/auth'

const auth = useOidc({
  issuer: 'https://idp.test',
  clientId: 'app',
  redirectUri: 'https://app.test/callback',
  fetch: fakeProvider.fetch, // serves discovery, JWKS and the token endpoint
  flows: memoryFlowStore(),
  redirect: (url) => {
    // "Log in" at the fake provider and come back with a code.
    void fakeProvider.authorize(url).then((back) => auth.handleCallback(back))
  },
})

await auth.signIn()
// …await until auth.status() is no longer 'signingIn'
expect(auth.claim('email')).toBe('ada@example.dev')
```

The live demo at the top of this page is built exactly this way — its provider is [`docs/src/examples/auth/fake-provider.ts`](https://github.com/pyreon/pyreon/blob/main/docs/src/examples/auth/fake-provider.ts), about a hundred lines that sign real ES256 tokens with Web Crypto and enforce PKCE. Copy it into your test suite. For the most realistic test, run [`oidc-provider`](https://github.com/panva/node-oidc-provider) in-process, as this package's own interop suite does.

## Security model

**On by default, and not configurable down:**

- Authorization code flow with **S256 PKCE**, `state` and `nonce`. The implicit flow, the password grant and PKCE `plain` are not offered.
- **RFC 9207** issuer check on the redirect, and issuer equality on discovery — the IdP mix-up defence.
- **https only** for the issuer and every endpoint it advertises (loopback http allowed for local development), and no following of redirects on provider calls.
- **Single-use pending flows** that expire after ten minutes; the authorization code is scrubbed from the URL and history before anything awaits.
- ID tokens: **RS256 and ES256 only** (no `none`, no HMAC algorithm confusion), `crit` headers refused, strict canonical base64url, `iss` / `aud` / `azp` / `exp` / `nbf` / `sub` / `nonce` all checked.
- Sessions: HMAC-SHA-256 compared in constant time, ≥ 32-character secrets, `__Host-` + `HttpOnly` + `Secure` + `SameSite=Lax` cookies.
- `returnTo` validated with the URL parser browsers use.

**Your production checklist** — these need storage or policy only your app has:

- [ ] Throttle every guessable check (TOTP, passkeys, passwords) with an attempt limiter keyed by account, and by IP for unauthenticated endpoints.
- [ ] Make sessions revocable: pass `isRevoked` to `verifySession` and keep revoked `jti`s until they expire.
- [ ] With more than one server instance, implement `FlowStore` over a shared store whose `take` is atomic.
- [ ] Store the passkey `signCount` and pass it back on the next assertion.
- [ ] Store TOTP `lastUsedStep` so a code cannot be replayed.
- [ ] Validate access tokens on your API on every request — client-side guards are UX, not security.

## API overview

| Area | Exports |
| --- | --- |
| Sign-in (web + native) | `useOidc`, `sessionStorageFlowStore`, `isRedirectFor` |
| State machine | `createAuth`, `memoryFlowStore`, `AuthError` |
| OIDC steps | `discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`, `refreshTokens`, `endSessionUrl` |
| ID tokens | `verifyIdToken`, `createJwksCache`, `fetchJwks`, `tokenKid` |
| Providers | `google`, `keycloak`, `github`, `facebook`, `oauth2`, `withPreset` |
| Route guards | `createGuard`, `safeReturnTo` |
| Sessions | `signSession`, `verifySession`, `sessionCookie` |
| Two-factor | `generateTotpSecret`, `totp`, `verifyTotp`, `base32Encode`, `base32Decode` |
| Passkeys | `passkeyChallenge`, `verifyRegistration`, `verifyAssertion`, `derToRaw` |
| Hardening | `createAttemptLimiter`, `timingSafeEqual` |
| PKCE | `generateCodeVerifier`, `codeChallengeS256`, `randomToken`, `base64url`, `decodeBase64url` |

Every signature, option and common mistake is in the [API reference](/docs/reference/auth).
