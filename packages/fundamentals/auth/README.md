# @pyreon/auth

Authentication primitives for Pyreon on Web Crypto + `fetch`, so the same code runs in the browser, Node, Bun and
workerd: OIDC / OAuth2 sign-in, ID-token verification, signed cookie sessions, TOTP and passkeys.

Tested against [`oidc-provider`](https://github.com/panva/node-oidc-provider), a certified OpenID Provider, run
in-process: discovery, PKCE + nonce, code exchange, ID-token verification, refresh and RP-initiated logout.

**Guide, with live demos you can break on purpose:** [pyreon.dev/docs/auth](https://pyreon.dev/docs/auth).

## Sign-in

```ts
import { useOidc } from '@pyreon/auth'

const auth = useOidc({
  issuer: 'https://accounts.google.com',
  clientId: 'app',
  redirectUri: 'https://app.example/callback',
  nativeRedirectUri: 'com.example.app:/oauth', // iOS + Android — see "Native"
})

auth.signIn() // → the provider; on /callback the page completes the sign-in itself
auth.status() // 'signedIn'
auth.claim('email') // a verified ID-token claim — never read identity from a raw token
```

`useOidc` is the same call on web, iOS and Android. On the web it keeps the pending sign-in in `sessionStorage` (a
browser sign-in is a full page load to the provider and back, so an in-memory store would be empty when the user
returns), and when the page that loads IS the redirect it completes the callback itself, removing the code from the
address bar and history first.

**A reload signs the web session out — on purpose.** The surface is the same on every target; where the session lives is
not. On iOS and Android the tokens are kept in the Keychain / Keystore and a relaunch is still signed in. In a browser
the tokens are held in memory only, so a reload or a new tab starts at `signedOut`. Persisting them to `localStorage` /
`sessionStorage` would hand the access and refresh tokens to any script that runs on the page, which turns one XSS bug
into a stolen long-lived session; there is deliberately no option for it. To stay signed in across reloads:

- call `auth.signIn()` when the app loads signed out — while the provider still has its own session, the round trip
  completes without a prompt; or
- keep the session on your server (a backend-for-frontend): complete the code exchange there and hand the browser a
  signed, `HttpOnly` cookie with `signSession` / `sessionCookie`, which page scripts cannot read.

Underneath is `createAuth`, which you can use directly — on a server, or to choose the flow store and navigation
yourself:

```ts
import { createAuth, google, sessionStorageFlowStore, withPreset } from '@pyreon/auth'

const auth = createAuth({
  issuer: google.issuer,
  client: withPreset(google, { clientId: 'app', redirectUri: 'https://app.example/cb' }),
  flows: sessionStorageFlowStore(), // a server uses a shared store — see "Running more than one instance"
  redirect: (url) => location.assign(url),
})
await auth.signIn() // → provider
await auth.handleCallback(location.href) // back on /cb
auth.claims()?.sub
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

  `createAttemptLimiter` is per process and bounded by `maxKeys`. A full table never frees a key that is at its limit
  (that would hand it a fresh budget): it drops an expired window, else the least-used active one, and when every
  slot is at its limit it refuses the new key instead. Size `maxKeys` above the keys legitimately active in one
  window. With several instances, keep the same counters in a shared store.
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

`useOidc` is the shared-source entry point. On iOS and Android the compiler lowers it to the native session container
`PyreonOidcAuth`, which runs the same flow as the web natively: discovery, S256 PKCE with state and nonce, the system
browser, the code exchange, ID-token verification against the provider's keys (RS256 / ES256), refresh, and provider
logout. The session lives in the Keychain / Keystore (via `@pyreon/storage`), so the app is still signed in after a
relaunch, and an expired session with a refresh token refreshes itself on launch. The web keeps tokens in memory only
and is signed out after a reload — see "A reload signs the web session out" above.

```tsx
import { useOidc } from '@pyreon/auth'

const auth = useOidc({
  issuer: 'https://accounts.example.com',
  clientId: 'app',
  redirectUri: 'https://app.example.com/callback', // web
  nativeRedirectUri: 'com.example.app:/oauth', // iOS + Android
  scope: 'openid profile email offline_access',
})
// <Button onPress={() => auth.signIn()}>Sign in</Button>
// <Text>{auth.isAuthenticated() ? auth.claim('email') : auth.status()}</Text>
```

Every member reads the same on all three targets, and the strings match: `status()` is `signedOut` / `signingIn` /
`signedIn` / `error`, and `error()` is the same code everywhere (`network_error`, `bad_nonce`, `cancelled`, …). Options
must be static (literals or module-level consts) because native bakes them in; anything else is reported by name and
nothing is emitted.

**Per-platform setup.**

- **iOS** — nothing. Sign-in runs in `ASWebAuthenticationSession`, which hands the redirect straight back. Register
  `nativeRedirectUri` with the provider; an https redirect is matched as a universal link on iOS 17.4+.
- **Android** — declare the two activities in `AndroidManifest.xml` (sources are wired, not an AAR, so there is no
  library manifest to merge), with your redirect's scheme:

  ```xml
  <activity android:name="com.pyreon.runtime.PyreonAuthActivity" android:exported="false"
      android:launchMode="singleTask" android:theme="@android:style/Theme.Translucent.NoTitleBar" />
  <activity android:name="com.pyreon.runtime.PyreonAuthRedirectActivity" android:exported="true">
    <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="com.example.app" />
    </intent-filter>
  </activity>
  ```

  Sign-in opens a Custom Tab when the browser supports it (no `androidx.browser` dependency), and returning to the app
  without finishing is reported as `cancelled` rather than leaving sign-in hanging.

**Parity is tested, not assumed.** `native/tests/vectors.json` is one answer sheet of signed ID tokens — valid ones and
every rejection the verifier makes — that the web, Swift and Kotlin verifiers must all agree on, error code for error
code. The native containers run end to end in the smoke tests against an in-process provider that enforces PKCE and
the nonce, and the `native-tasks` example's sign-in panel is asserted on a real simulator and emulator.

**What stays web/server.** The lower-level API — `createAuth`, `discover`, `exchangeCode`, sessions, TOTP, passkeys,
the route guard — is web or server code. Native apps hold one session per `useOidc` call: create it once at the root
and pass it down.

MIT
