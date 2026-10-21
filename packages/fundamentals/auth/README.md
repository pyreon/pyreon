# @pyreon/auth

Authentication primitives for Pyreon on Web Crypto + `fetch`, so the same code runs in the browser, Node, Bun and
workerd: OIDC / OAuth2 sign-in, ID-token verification, signed cookie sessions, TOTP and passkeys.

Tested against [`oidc-provider`](https://github.com/panva/node-oidc-provider), a certified OpenID Provider, run
in-process: discovery, PKCE + nonce, code exchange, ID-token verification, refresh and RP-initiated logout.

## Sign-in

```ts
import { createAuth, google, memoryFlowStore, withPreset } from '@pyreon/auth'

const auth = createAuth({
  issuer: google.issuer,
  client: withPreset(google, { clientId: 'app', redirectUri: 'https://app.example/cb' }),
  flows: memoryFlowStore(), // see "Running more than one instance"
  redirect: (url) => location.assign(url),
})

await auth.signIn() // → provider
await auth.handleCallback(location.href) // back on /cb
auth.status() // 'signedIn'
auth.claims()?.sub // verified ID-token claims — never read identity from tokens().id_token
```

`createAuth` verifies the ID token before reporting `signedIn`: signature against the provider's JWKS, `iss`, `aud`,
`exp` / `nbf`, and this sign-in's `nonce`. The key set is cached and re-fetched when a token names an unknown `kid`, so
provider key rotation needs no restart.

**Staying signed in.** `auth.expiresAt()` is when the access token expires (epoch ms). `await auth.refresh()` swaps in
fresh tokens; a refreshed ID token must name the same `sub`, so a refresh can never switch users. Providers differ on
when they issue a refresh token: request `offline_access` in `scope`, and pass provider-specific parameters through
`client.authorizationParams` (Google: `{ access_type: 'offline', prompt: 'consent' }`). The parameters that carry the
flow's security (`state`, `nonce`, PKCE, `redirect_uri`, …) cannot be overridden there.

**Signing out.** `auth.signOut()` clears local state only, so the provider still has a session and the next sign-in
completes without a prompt. `auth.signOut({ endProviderSession: true, postLogoutRedirectUri })` also sends the user to
the provider's `end_session_endpoint` with an `id_token_hint`.

The lower-level steps are exported too (`discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`,
`refreshTokens`, `endSessionUrl`, `verifyIdToken`, `createJwksCache`) for server-side flows.

## Secure defaults

S256-only PKCE, `state` + `nonce`, RFC 9207 `iss` check, https-only discovery with issuer equality and https on every
advertised endpoint (loopback http is allowed for local development), single-use flows that expire after 10 minutes,
ID tokens limited to RS256 / ES256 with `crit` headers refused, cookies `__Host-` + HttpOnly + Secure + SameSite=Lax,
passkey ceremonies from a cross-origin iframe refused unless `allowCrossOrigin`, and a guard whose `returnTo` only
accepts paths that stay on the same origin under the URL parser. Not offered, on purpose: the implicit flow, the
password grant, PKCE `plain`.

## Production checklist

These are not defaults because they need storage or policy only the app has.

- **Throttle every guessable check.** A 6-digit TOTP code is brute-forceable without a limit. Wrap `verifyTotp`,
  `verifyAssertion` and any password check in an attempt limiter, keyed by account (and by IP for unauthenticated
  endpoints), and `reset` it on success:

  ```ts
  const limiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60_000 })
  const gate = limiter.attempt(userId)
  if (!gate.allowed) return tooManyRequests(gate.retryAfterMs)
  const r = await verifyTotp(secret, code, { lastUsedStep })
  if (r.ok) {
    limiter.reset(userId)
    lastUsedStep = r.step // store it: a code is single-use
  }
  ```

  `createAttemptLimiter` is per process and bounded (`maxKeys`, oldest window evicted first). With several instances,
  keep the same counters in a shared store.
- **Make sessions revocable.** A signed cookie is valid until it expires. Every session carries a `jti`; pass
  `isRevoked` to `verifySession` and keep revoked ids (logout everywhere, a stolen device) until their `exp`.
- **Running more than one instance.** `memoryFlowStore` holds pending sign-ins in one process, so a callback that
  lands on a different instance fails with `unknown_flow`. Implement `FlowStore` over a shared store; `take` must
  read and delete atomically, and entries can expire after `FLOW_TTL_MS`.
- **Keep the passkey `signCount`.** Store the `signCount` `verifyAssertion` returns and pass it back next time; a
  counter that does not increase signals a cloned authenticator.

## Passkeys

`verifyRegistration` (`none` attestation) and `verifyAssertion` support ES256 (P-256) and RS256 (RSA ≥ 2048 bits, which
Windows Hello uses). The stored key's type decides the algorithm, never the incoming assertion. Request both from the
browser: `pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }]`.

## Native (iOS / Android)

App-facing auth state on native is the existing `useAuth` container from `@pyreon/hooks` (`PyreonAuth`) — one source,
three targets. This package ships the *mechanism* that drives it: `native/swift/PyreonOidc.swift` and
`native/kotlin/.../PyreonOidc.kt` (PKCE S256, state/nonce, RFC 9207 `iss`, 10-minute single-use flow persisted through a
`PyreonAuthFlowStore` so a login survives process death in the system browser). Both are compiled and run by
`check-native-cosource`.

**Sign-in composition (no new SDK code).** The system browser is the existing `useLinking().openUrl` (lowers to
`UIApplication.open` / `Intent.ACTION_VIEW`, the RFC 8252 default-browser path); the redirect comes back as a deep link
through the router to your callback route, which hands the URL to the core. Drive the `useAuth` container from there:
`beginSignIn()` -> `openUrl(authUrl)` -> (callback route) `complete(...)` -> token exchange over `fetch` ->
`signInSucceeded(user)` / `signInFailed(...)`. Use an HTTPS claimed redirect (universal link / App Link) rather than a
custom scheme where you can, since a custom scheme can be claimed by another app.

**Not built: lowering the web API to the native cores (design notes).** PMTC lowers hooks it recognizes by name, so an
`@pyreon/auth` import in shared source would need a native plugin (recognizer, declaration emit, Swift/Kotlin container, stub
and golden registration). Three decisions make it a separate piece of work rather than a lowering table:

1. **Sync vs async.** The web core is async (`crypto.subtle`); the native cores are synchronous. One source needs either a
   synchronous SHA-256 on web or `await` lowering over the container methods.
2. **A durable flow store per platform.** The pending flow must survive process death while the system browser is open.
   iOS can use the Keychain; Android needs Keystore code that imports the real Android SDK, which the stub gates cannot
   verify, so it is covered only by the device gate.
3. **No second state container.** The container must drive the existing `useAuth` rather than add another one.

Until that lands, compose the lowered hooks as described above (`useSecureStorage`, `useLinking`, `useFetch`, `useAuth`).
The package stays declared web-only so the compiler warns on import instead of miscompiling. The end-to-end browser round trip
on a simulator or emulator is likewise unverified.

MIT
