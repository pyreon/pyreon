---
"@pyreon/auth": minor
---

New package `@pyreon/auth`, providing web authentication primitives on Web Crypto + fetch, so the same code runs in the browser, Node, Bun and workerd.

- **OIDC / OAuth2 sign-in:** `discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`.
  - Authorization code flow with S256 PKCE, state and nonce, and the RFC 9207 `iss` check.
  - Discovery is https-only, and the returned `issuer` must equal the URL it was fetched from. Every advertised endpoint must be https as well.
- **Reactive state:** `createAuth` exposes `status`, `tokens`, `claims` and `error` as signals.
  - When the provider returns an ID token, it is verified before the session counts as signed in: signature against the provider's JWKS, `iss`, `aud`, `exp`/`nbf` and this flow's nonce.
  - `claims` holds the verified payload.
- **Flow storage:** `memoryFlowStore` deletes abandoned sign-ins after the 10-minute flow lifetime and caps how many it holds.
- **ID tokens:** `verifyIdToken` / `fetchJwks`.
  - RS256 and ES256 only; `none` and `HS*` are refused.
  - A token declaring `crit` header extensions is refused.
  - Malformed tokens and key sets fail with an `AuthError`.
- **Sessions:** `signSession`, `verifySession` and `sessionCookie` (HMAC-SHA256 with rotatable secrets; `__Host-`, HttpOnly, Secure, SameSite=Lax).
- **Second factor:** TOTP with `verifyTotp` (RFC 6238, with replay protection).
- **Passkeys:** `verifyRegistration` and `verifyAssertion` (WebAuthn, ES256, `none` attestation). A ceremony run in a cross-origin iframe is rejected unless `allowCrossOrigin` is set.
- **Provider presets:** `google`, `keycloak`, `github`, `facebook`, `oauth2`.
- **Passport bridge:** `@pyreon/auth/passport`.
- **Route guard:** `createGuard` with `safeReturnTo`.
  - `safeReturnTo` rejects control characters and backslashes, then confirms the value resolves to the same origin under the URL parser.
  - Browsers strip tab, CR and LF before parsing, so `/\t/evil.example` would otherwise navigate off-site.
- **Native cores:** `PyreonOidc.swift` / `.kt` are co-sourced. Their persistent flow stores now sweep abandoned flows.
