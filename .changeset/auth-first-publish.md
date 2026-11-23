---
'@pyreon/auth': minor
---

`@pyreon/auth` is published to npm for the first time, with this release. It is **Experimental**: its API may change in a minor release. Its first version is published by hand, without provenance; later versions publish through CI with provenance.

Security fixes and contract changes made before the first publish:

- **Login CSRF in server-side sign-ins.** A pending flow was looked up by `state` alone, so an attacker could start a sign-in, finish it at the provider as themselves and send the callback URL to a victim, whose browser then signed in to the attacker's account. Every flow is now bound to the browser that started it. In the browser the tab's own storage does this. On a server, `createFlowBinding(cookieHeader)` sets a `__Host-` cookie when the sign-in starts and `readFlowBinding(cookieHeader)` reads it on the callback. `createAuth` takes the value as `binding` and refuses to start without one unless the store is tab-scoped. `beginAuthorization` and `parseCallback` take it as an argument.
- **New `FlowStore` contract.**
  - `save(key, flow)` / `take(key)` store flows under an opaque key derived from the state, issuer, client id, redirect URI and browser binding.
  - Another provider's or client's instance, or another browser, never reads a flow, so a store cannot hand one to the wrong party.
  - `PendingFlow` gains `clientId` and `binding`.
  - `sessionStorageFlowStore` is `tabScoped`.
- **OAuth mix-up (RFC 9700 §4.4), on the web, iOS and Android.**
  - Instances are registered process-wide by redirect URI. Two providers may share one only if both send RFC 9207 `iss`: a provider known not to is refused at construction (explicit metadata) or at sign-in (`redirect_shared`), and every callback on a shared redirect URI must carry `iss`.
  - The native compiler refuses two issuers on one `nativeRedirectUri` in a file. Use one per provider (`com.example.app:/oauth/google`).
  - `dispose()` releases an instance's claim; `useOidc` calls it when its component unmounts.
  - The callback must arrive at the flow's own redirect URI (`redirect_mismatch`). The matching rule (scheme and host lowercased, default ports dropped, the path as written) is now the same on all three targets.
  - A flow started for another issuer or client is refused (`issuer_mismatch`).
- **Server callbacks behind a proxy.** `handleCallback` accepts the request's path and query (Node's `req.url`) and resolves it against the configured redirect URI's origin; forwarded headers are never read. A path passed to `parseCallback` fails with `invalid_callback` instead of a `TypeError`.
- **`response_mode` is reserved** (`form_post` would drop the `SameSite=Lax` binding cookie on the cross-site POST).
- **Refresh, on the web, iOS and Android.** Concurrent `refresh()` calls share one request, so an already-rotated refresh token is never presented again (providers with reuse detection revoked the session). A refresh no longer discards a sign-in in flight, and never overwrites a newer session.
- **ID tokens, on all three targets:**
  - `azp` must be this client whenever it is present;
  - an `iat` in the future is refused;
  - a key whose `key_ops` excludes `verify` and RSA keys under 2048 bits are ignored.

  On the web, `verifyIdToken` also takes a `createJwksCache` cache. A token that fails against the cached keys (rotation, no `kid`) triggers one throttled re-fetch. A new `maxAge` option bounds `iat`.
- **Strict inputs:**
  - `safeReturnTo` refuses paths that resolve or decode to `//host` (`/a/../..//evil`, `/%2F%2Fevil`, `;` path parameters, more than three layers of encoding);
  - passkey DER signatures must be canonical;
  - `sessionCookie` refuses names and values that would inject attributes;
  - `totp` and `verifyTotp` share `period` / `digits` options, and a secret under 128 bits throws (`allowShortSecret: true` admits existing 80-bit secrets).
- **Native:**
  - the stored session is keyed by client id and issuer;
  - `signOut({ endProviderSession: true })` after a relaunch now discovers the provider and ends its session.
- **Smaller public surface.** `timingSafeEqual`, `derToRaw`, `base32Encode`, `base32Decode`, `base64url`, `decodeBase64url`, `randomToken`, `tokenKid`, `fetchJwks` and `isRedirectFor` are no longer exported. Every remaining export is documented in the API reference.
- The npm tarball no longer ships the native test sources (`native/tests`).
