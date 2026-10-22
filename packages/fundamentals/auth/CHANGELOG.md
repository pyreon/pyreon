# @pyreon/auth

## 0.54.0

### Minor Changes

- [#3950](https://github.com/pyreon/pyreon/pull/3950) [`f8a9770`](https://github.com/pyreon/pyreon/commit/f8a97700f3fbd9c0f497824e6beb4d18ecad6f13) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/auth` now runs on iOS and Android from shared source.

  - **`useOidc({ issuer, clientId, redirectUri, nativeRedirectUri })`** is a reactive OIDC sign-in with the same surface on web, iOS and Android. Every member is read as a call (`status()`, `subject()`, `claim(name)`, `accessToken()`, `expiresAt()`, `error()`), and the status spellings and error codes are identical on all three targets.
    - On the web it is `createAuth` with browser defaults: pending sign-ins in `sessionStorage` (new `sessionStorageFlowStore`), and the callback completed automatically on the redirect page, with the code removed from the address bar and history first.
    - On iOS and Android the compiler lowers it to the native session container `PyreonOidcAuth` (the package now ships a native plugin, `@pyreon/auth/native-plugin`):
      - the system browser (`ASWebAuthenticationSession`, or an Android Custom Tab) with S256 PKCE, state and nonce;
      - the code exchange, and ID-token verification against the provider's keys (RS256 / ES256);
      - refresh, and provider logout;
      - the session kept in the Keychain / Keystore, so the app stays signed in across relaunches.
    - Android apps declare `PyreonAuthActivity` and `PyreonAuthRedirectActivity` in their manifest (see the README).
  - **Cross-target parity is enforced:** a shared set of signed test tokens (`native/tests/vectors.json`) must get the same verdict and error code from the web, Swift and Kotlin verifiers.
  - **Fixes found while building that parity:**
    - JWS segments are now decoded as strict, canonical base64url everywhere. `atob` accepted whitespace, `+`, `/` and `=`, so a token's signature segment could be re-encoded without invalidating it.
    - The web verifier imports only a key's material. A published key carrying `"alg": ""` was rejected on the web while the native verifiers accepted it.
    - A token's `kid` and `nonce` must be strings, one explicit rule on all targets rather than JavaScript truthiness.
    - A failed request is now reported as `network_error` on every target (it was `unknown` on the web).
  - **Native auth requests refuse redirects,** as the web's `redirect: 'error'` does.
  - **The web-only package list** in `@pyreon/native-compiler` no longer includes `@pyreon/auth`.

- [#3876](https://github.com/pyreon/pyreon/pull/3876) [`3ba6e9f`](https://github.com/pyreon/pyreon/commit/3ba6e9fe8a1cbf53d512112bc1eba26c1c0b129b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/auth`, providing web authentication primitives on Web Crypto + fetch, so the same code runs in the browser, Node, Bun and workerd. Interop-tested in-process against `oidc-provider`, a certified OpenID Provider.

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

### Patch Changes

- Updated dependencies [[`597eff1`](https://github.com/pyreon/pyreon/commit/597eff15a534373d09bb290e8749608611b8319f), [`f8a9770`](https://github.com/pyreon/pyreon/commit/f8a97700f3fbd9c0f497824e6beb4d18ecad6f13), [`457c9ce`](https://github.com/pyreon/pyreon/commit/457c9cebd6583f88cdb309f35b1dba6ae6fc8044), [`02da900`](https://github.com/pyreon/pyreon/commit/02da900bf63421da6d2bcea6a45c1dfa43691168), [`956a521`](https://github.com/pyreon/pyreon/commit/956a5214e0208b883767aee1d91acefefe7c1557), [`1e1c9b7`](https://github.com/pyreon/pyreon/commit/1e1c9b7c54cb7c02d30e64e86da5d823cb3595e4), [`02da900`](https://github.com/pyreon/pyreon/commit/02da900bf63421da6d2bcea6a45c1dfa43691168), [`7e39941`](https://github.com/pyreon/pyreon/commit/7e39941a6fe07657c5fc010ee4d0985dc26675d9), [`a0ab9cf`](https://github.com/pyreon/pyreon/commit/a0ab9cf627a21fc83c746e0aaf1312aabe6cf0b1), [`a503e83`](https://github.com/pyreon/pyreon/commit/a503e837a25e93b61e3f2b9e1b55144c06157e22), [`6aef1c9`](https://github.com/pyreon/pyreon/commit/6aef1c91c0b8d30530cf36adaaf5ef7116ea9ad0), [`310bf91`](https://github.com/pyreon/pyreon/commit/310bf91f6673d747a77e1996647673fce725d0db), [`1a7ccdd`](https://github.com/pyreon/pyreon/commit/1a7ccdda20096710a2486f67e97025776552f3f5), [`db8c255`](https://github.com/pyreon/pyreon/commit/db8c255cea867d0bd092ab377629a47c5cdaaefe), [`d55ecbb`](https://github.com/pyreon/pyreon/commit/d55ecbb061f0599836fc4385b5d694854e47a935), [`760cbef`](https://github.com/pyreon/pyreon/commit/760cbefcbbd7378413f1020a1b33740c60b0ec5e), [`04ccbe7`](https://github.com/pyreon/pyreon/commit/04ccbe7d34879d554e35524a03f5e2f5761775fb), [`02da900`](https://github.com/pyreon/pyreon/commit/02da900bf63421da6d2bcea6a45c1dfa43691168), [`784e46a`](https://github.com/pyreon/pyreon/commit/784e46a486c2ccb16728117c392f0194b563fd66), [`eab5598`](https://github.com/pyreon/pyreon/commit/eab5598203c2973217cf815a47c7a27567e268fa), [`6ea59b1`](https://github.com/pyreon/pyreon/commit/6ea59b115639d71b3645b267c9572185a9d52a63), [`87ccdb5`](https://github.com/pyreon/pyreon/commit/87ccdb56ca5247dcfbb1309c7875d65204549b0d), [`9018b4b`](https://github.com/pyreon/pyreon/commit/9018b4b2ef3fb50b6eacbdca9f9e553ad0efb541), [`3f1009e`](https://github.com/pyreon/pyreon/commit/3f1009eb66fbf6aac01a9b74c096d747bd6f5e6c)]:
  - @pyreon/native-compiler@0.54.0
  - @pyreon/reactivity@0.54.0
  - @pyreon/storage@0.54.0
