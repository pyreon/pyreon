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

MIT
