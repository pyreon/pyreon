---
"@pyreon/auth": minor
---

New package `@pyreon/auth`, providing web authentication primitives on Web Crypto + fetch, so the same code runs in the browser, Node, Bun and workerd. Interop-tested in-process against `oidc-provider`, a certified OpenID Provider.

- **OIDC / OAuth2 sign-in:** `discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`.
  - Authorization code flow with S256 PKCE, state and nonce, and the RFC 9207 `iss` check.
  - Discovery is https-only, and the returned `issuer` must equal the URL it was fetched from. Every advertised endpoint must be https as well (loopback http is allowed for local development, including for the key set).
  - `client.authorizationParams` adds provider parameters such as `prompt` or Google's `access_type`; it cannot override `state`, `nonce`, PKCE or `redirect_uri`.
  - `refreshTokens` and `endSessionUrl` (RP-initiated logout).
- **Reactive state:** `createAuth` exposes `status`, `tokens`, `claims`, `expiresAt` and `error` as signals.
  - `refresh()` keeps the old refresh token when the provider does not rotate it, and refuses a refreshed ID token for a different `sub`.
  - `signOut({ endProviderSession: true })` also ends the session at the provider.
  - Signing keys come from a cached JWKS that is re-fetched (throttled) when a token names an unknown `kid`, so key rotation needs no restart.
  - When the provider returns an ID token, it is verified before the session counts as signed in: signature against the provider's JWKS, `iss`, `aud`, `exp`/`nbf` and this flow's nonce.
  - `claims` holds the verified payload.
- **Flow storage:** `memoryFlowStore` deletes abandoned sign-ins after the 10-minute flow lifetime and caps how many it holds.
- **ID tokens:** `verifyIdToken`, `fetchJwks` and `createJwksCache`.
  - RS256 and ES256 only; `none` and `HS*` are refused.
  - A token declaring `crit` header extensions is refused.
  - Malformed tokens and key sets fail with an `AuthError`.
- **Sessions:** `signSession`, `verifySession` and `sessionCookie` (HMAC-SHA256 with rotatable secrets; `__Host-`, HttpOnly, Secure, SameSite=Lax). `verifySession({ isRevoked })` rejects a revoked session id.
- **Attempt limiting:** `createAttemptLimiter`, a bounded per-process limiter for TOTP and passkey attempts.
- **Second factor:** TOTP with `verifyTotp` (RFC 6238, with replay protection).
- **Passkeys:** `verifyRegistration` and `verifyAssertion` (WebAuthn, ES256 and RS256 for Windows Hello, `none` attestation). The stored key's type picks the algorithm. A ceremony run in a cross-origin iframe is rejected unless `allowCrossOrigin` is set.
- **Provider presets:** `google`, `keycloak`, `github`, `facebook`, `oauth2`.
- **Passport bridge:** `@pyreon/auth/passport`.
- **Route guard:** `createGuard` with `safeReturnTo`.
  - `safeReturnTo` rejects control characters and backslashes, then confirms the value resolves to the same origin under the URL parser.
  - Browsers strip tab, CR and LF before parsing, so `/\t/evil.example` would otherwise navigate off-site.
- **Native cores:** `PyreonOidc.swift` / `.kt` are co-sourced. Their persistent flow stores now sweep abandoned flows.
