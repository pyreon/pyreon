# @pyreon/auth

> **Status: Experimental.** Outside the semver promise: the API may change in a minor release. See the [stability policy](https://pyreon.dev/docs/stability-and-direction).

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
  signed, `HttpOnly` cookie with `signSession` / `sessionCookie`, which page scripts cannot read. Bind each sign-in to
  the browser that started it — see "On a server" below.

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

**When a refresh fails.** If the provider cannot be reached or is unavailable (`network_error`, `provider_unavailable`
for 429 / 5xx, `discovery_failed`, `jwks_failed`), the session is kept for a retry: `status()` is `'error'` with that
code, the refresh token stays (on iOS and Android the stored session stays too), and `refresh()` tries again. Any other
failure (the refresh token refused or revoked, a bad ID token) ends the session.

**Redirect URIs are checked when you configure them.** A redirect URI the matcher would refuse (a non-ASCII host —
write it in punycode — a percent-encoded dot, a backslash or whitespace) throws in `createAuth` and fails
`beginAuthorization` (`invalid_redirect_uri`); natively the container starts in `error` with that code, and the
compiler refuses it. A callback whose URL the matcher refuses never matches.

**Signing out.** `auth.signOut()` clears local state only, so the provider still has a session and the next sign-in
completes without a prompt. `auth.signOut({ endProviderSession: true, postLogoutRedirectUri })` also sends the user to
the provider's `end_session_endpoint` with an `id_token_hint`.

**On a server (backend-for-frontend)**, two things are yours to supply: a `FlowStore` all instances share, and a
**browser binding**. The `state` travels in the callback URL, so on its own it cannot say which browser started the
sign-in: an attacker could start one, finish it at the provider as themselves and send the callback URL to a victim,
who would then be signed in to the attacker's account (login CSRF; PKCE does not help, the verifier is on your server).
`createFlowBinding(cookieHeader)` returns a random value and the `Set-Cookie` header (`__Host-`, HttpOnly, 10 minutes)
to send with the redirect; on the callback, `readFlowBinding(cookieHeader)` reads it back. `createAuth` refuses to start
without a binding unless the store is tab-scoped (`sessionStorageFlowStore`), and `useOidc` supplies one itself.

```ts
import { createAuth, createFlowBinding, memoryFlowStore, readFlowBinding } from '@pyreon/auth'

const config = {
  issuer: 'https://accounts.example.com',
  client: { clientId: 'bff', redirectUri: 'https://app.example.com/auth/callback' },
  flows: memoryFlowStore(), // a shared store (Redis GETDEL) with several instances
}

// GET /login
const binding = createFlowBinding(req.headers.get('cookie'))
let location = '/'
await createAuth({ ...config, binding: binding.value, redirect: (url) => (location = url) }).signIn()
// → 302 to `location`, with Set-Cookie: binding.setCookie

// GET /auth/callback
const auth = createAuth({ ...config, binding: readFlowBinding(req.headers.get('cookie')), redirect: () => {} })
// The request's PATH and query (Node's req.url), resolved against the configured redirect origin.
// Behind a TLS-terminating proxy the absolute request URL is the internal one and is refused.
await auth.handleCallback(req.url) // a callback opened in another browser fails with unbound_flow / unknown_flow
```

**One redirect URI per provider.** Most providers send no `iss` on the redirect, so the redirect URI is what says which
provider answered. With a shared one, a malicious or compromised provider you also offer could bounce the user to an
honest one and receive its code and your PKCE verifier (the OAuth mix-up attack, RFC 9700 §4.4). Instances are
registered process-wide by redirect URI: two providers may share one only if both send RFC 9207 `iss` — a provider known
not to is refused at construction (explicit metadata) or at sign-in (`redirect_shared`), and every callback on a shared
URI must carry `iss`. `auth.dispose()` releases a claim: `useOidc` does it on unmount on the web, the iOS container on
deinit, and `rememberPyreonOidcAuth` when it leaves the composition on Android; a disposed instance that signs in again
registers again. Use `/auth/callback/github`,
`/auth/callback/google`, … — and on iOS / Android one `nativeRedirectUri` per provider (`com.example.app:/oauth/google`):
the compiler and the native runtime apply the same rule.

**Hot reload and tests.** The registry lives as long as the page or process. A module-level `createAuth` whose issuer
you edit during hot module replacement keeps its old claim until a full reload. In your own tests, call `auth.dispose()`
for every instance a test creates (the registry's reset is internal), or give each test its own redirect URI.

The lower-level steps are exported too (`discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`,
`refreshTokens`, `endSessionUrl`, `verifyIdToken`, `createJwksCache`) for server-side flows; `beginAuthorization` and
`parseCallback` take the browser binding.

## Secure defaults

S256-only PKCE, `state` + `nonce`, pending flows bound to the client, redirect URI and browser that started them
(login CSRF), one redirect URI per provider and the callback checked against it plus the RFC 9207 `iss` check (OAuth
mix-up), https-only discovery with issuer equality and https on every
advertised endpoint (loopback http is allowed for local development), single-use flows that expire after 10 minutes,
ID tokens limited to RS256 / ES256 with `crit` headers refused, `azp` and `iat` checked, `key_ops` honoured and RSA keys
under 2048 bits ignored, one refresh in flight per session, cookies `__Host-` + HttpOnly + Secure + SameSite=Lax,
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
- **Bind server-side sign-ins to the browser** with `createFlowBinding` / `readFlowBinding` (see "On a server").
- **Running more than one instance.** `memoryFlowStore` holds pending sign-ins in one process, so a callback that
  lands on a different instance fails with `unknown_flow`. Implement `FlowStore` over a shared store; `take` must
  read and delete atomically, and entries can expire after 10 minutes (the flow lifetime).
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

**A restored session that has expired** is `signingIn` until its refresh completes: on iOS the refresh starts when the
view appears (`.onAppear { auth.start() }`, emitted by the compiler) or on the first read of `accessToken`, on Android
when the container enters the composition. An expired access token is never returned (`accessToken` is null until the
refresh lands). In hand-written Swift or Kotlin, `await auth.freshAccessToken()` (Kotlin: blocking, off the main thread)
returns a token refreshed first when needed. Refreshes are shared PROCESS-WIDE per stored session, adopt only the same
user's stored session, and never sign a signed-out instance back in.

Every member reads the same on all three targets, and the strings match: `status()` is `signedOut` / `signingIn` /
`signedIn` / `error`, and `error()` is the same code everywhere (`network_error`, `bad_nonce`, `cancelled`, …). Options
must be static (literals or module-level consts) because native bakes them in; anything else is reported by name and
nothing is emitted.

**Per-platform setup.**

- **iOS** — nothing. Sign-in runs in `ASWebAuthenticationSession`, which hands the redirect straight back. Register
  `nativeRedirectUri` with the provider; an https redirect is matched as a universal link on iOS 17.4+.
- **One `nativeRedirectUri` per provider** — `com.example.app:/oauth/google`, `com.example.app:/oauth/github`, not one
  shared `com.example.app:/oauth`: the OAuth mix-up attack above works on native too. The compiler warns about two issuers on
  one `nativeRedirectUri` in a file; the native runtime refuses to sign in on a shared one unless the provider sends
  `iss`, and then requires it on the callback.
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
the nonce.

**Native sign-in is unverified on a device against a real provider.** On a real simulator and emulator, the
`native-tasks` example's sign-in panel has been driven only to the `network_error` path (an unreachable issuer). A
complete sign-in through the system browser, a real provider and the redirect back into the app has not been run on a
device. Test your provider on your devices before you rely on it.

**What stays web/server.** The lower-level API — `createAuth`, `discover`, `exchangeCode`, sessions, TOTP, passkeys,
the route guard — is web or server code. Native apps hold one session per `useOidc` call: create it once at the root
and pass it down.

## Security notes and known limits

`@pyreon/auth` is **Experimental**: its API may change in a minor release. These are the limits to accept before you
ship it:

- **L1 — iOS Keychain backups.** The session is stored with `kSecAttrAccessibleAfterFirstUnlock`, not `…ThisDeviceOnly`: the refresh token can move to another device through an encrypted backup, and Keychain items survive an uninstall.
- **L2 — no verified identity without an ID token.** A sign-in with an OAuth2-only provider (GitHub, Facebook) has no verified identity until a refresh brings an ID token.
- **L3 — callback parsing.** Duplicated callback parameters are read differently on Android (last value) than on the web and iOS (first). On native, a flow started for another provider is refused but consumed, so that sign-in has to be retried.
- **Native sign-in is unverified on a device.** It has never completed against a real provider on a device (only the `network_error` path has run on a simulator and emulator), and the native redirect check has not been tested against real `ASWebAuthenticationSession` / Custom Tab callbacks.
- **Android custom schemes.** Another installed app can claim the scheme and receive the redirect; PKCE is then the only defence. Any app can send the exported `PyreonAuthRedirectActivity` a fake redirect, which cancels a sign-in in progress. Prefer an App Link.
- **Sign-out does not revoke tokens.** `signOut({ endProviderSession: true })` ends the provider session; tokens already issued stay valid until they expire (no RFC 7009 revocation).
- **OAuth mix-up: one redirect URI per provider is the only complete defence.** The registry only sees providers alive at the same moment in one process: not a server or worker that builds only the requested provider, and not a browser page that builds only the chosen provider (the common single-page-app pattern). Where it sees them, two providers may share a redirect URI only if both send RFC 9207 `iss`; a provider known not to is refused (`redirect_shared`), and a callback on a shared URI must carry `iss`. The native compiler only warns, one file at a time. On Android the claim is taken and released by `rememberPyreonOidcAuth`'s effect (SDK code, verified only by a device build, which has not run).
- **A leaked authorization request still allows login CSRF.** Someone who obtains the provider URL a victim's browser was sent to can sign in with it as themselves and send the resulting callback to that browser, whose binding matches. Pushed authorization requests (PAR) are not offered.
- **Server sign-ins need the public callback path or URL, and HTTPS.** Pass `handleCallback` the request's path and query (or the public URL), never a proxy's internal URL. The binding cookie is `__Host-` (Secure): Safari does not set it on `http://localhost`, so a local server sign-in fails with `unbound_flow` — develop over HTTPS (`https()` from `@pyreon/zero/server`). `response_mode=form_post` is not supported.
- **The first version is published by hand, without provenance**, from a release tag, after `package.json` is moved onto the group version (it is 0.53.0 in this change). Later versions publish through CI with provenance.
- **TOTP secrets under 128 bits throw** unless `allowShortSecret: true` is set. Existing 80-bit enrolments need the flag: a behaviour change to announce.

MIT
