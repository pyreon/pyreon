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

**Not built, and why.** A compiler recognizer that lowers `beginAuthorization` / `parseCallback` to these cores, so the
package stays declared web-only. It changes `@pyreon/native-compiler` and its Swift/Kotlin validation suite, which is a
separate, heavier PR. The end-to-end browser round trip on a simulator/emulator is likewise unverified.

MIT
