---
"@pyreon/auth": minor
---

New package `@pyreon/auth` (phase 1a): OIDC/OAuth2 authorization-code + S256 PKCE primitives (`discover`, `beginAuthorization`, `parseCallback`, `exchangeCode`) with state, nonce, RFC 9207 `iss` checks and https-only discovery, plus a framework-neutral route guard (`createGuard`, `safeReturnTo`).
