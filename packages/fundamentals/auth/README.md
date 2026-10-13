# @pyreon/auth

Authentication primitives for Pyreon — OIDC/OAuth2 authorization-code + PKCE, route guards, secure by default.

> **Status: phase 1b+.** OIDC core, reactive `createAuth`, `google`/`keycloak`/`github`/`facebook` presets, signed cookie sessions, ID-token verification (`verifyIdToken`). The Passport bridge ships as `@pyreon/auth/passport`. TOTP (verifyTotp) ships; passkey registration and sign-in verification (verifyRegistration, verifyAssertion) ship; the native (Swift/Kotlin) runtime are later phases.

```ts
import { discover, beginAuthorization, parseCallback, exchangeCode } from '@pyreon/auth'

const meta = await discover('https://accounts.example')
const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }

const { url, flow } = await beginAuthorization(meta, client) // store `flow` server-side; redirect to `url`
const { code } = parseCallback(callbackUrl, flow, meta)
const tokens = await exchangeCode(meta, client, flow, code)
```

Secure defaults: S256-only PKCE, `state` + `nonce`, RFC 9207 `iss` check, https-only discovery with issuer equality,
single-use flows that expire after 10 minutes, and a guard whose `returnTo` only accepts same-origin paths.
Not offered, on purpose: the implicit flow, the password grant, PKCE `plain`.

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
