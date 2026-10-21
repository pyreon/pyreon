---
"@pyreon/auth": minor
"@pyreon/native-compiler": patch
---

`@pyreon/auth` now runs on iOS and Android from shared source.

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
