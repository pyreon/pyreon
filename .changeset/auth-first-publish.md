---
'@pyreon/auth': minor
---

`@pyreon/auth` is published to npm for the first time. It is **Experimental**: its API may change in a minor release.

Security fixes and contract changes made before the first publish:

- **Login CSRF in server-side sign-ins.** A pending flow was looked up by `state` alone, so an attacker could start a sign-in, finish it at the provider as themselves and send the callback URL to a victim, whose browser then signed in to the attacker's account. Every flow is now bound to the browser that started it. In the browser the tab's own storage does this. On a server, `createFlowBinding(cookieHeader)` sets a `__Host-` cookie when the sign-in starts and `readFlowBinding(cookieHeader)` reads it on the callback. `createAuth` takes the value as `binding` and refuses to start without one unless the store is tab-scoped. `beginAuthorization` and `parseCallback` take it as an argument.
- **New `FlowStore` contract.**
  - `save(key, flow)` / `take(key)` store flows under an opaque key derived from the state, issuer, client id, redirect URI and browser binding.
  - Another provider's or client's instance, or another browser, never reads a flow, so a store cannot hand one to the wrong party.
  - `PendingFlow` gains `clientId` and `binding`.
  - `sessionStorageFlowStore` is `tabScoped`.
- **OAuth mix-up (RFC 9700 §4.4).**
  - Two providers may no longer share a redirect URI over one flow store; `createAuth` throws at construction.
  - The callback must arrive at the flow's own redirect URI (`redirect_mismatch`), on the web, iOS and Android.
  - A flow started for another issuer or client is refused (`issuer_mismatch`).
- **Concurrent `refresh()`** calls share one request on the web, iOS and Android. A second call no longer presents an already-rotated refresh token, which made providers with reuse detection revoke the session.
- **ID tokens, on all three targets:**
  - `azp` must be this client whenever it is present;
  - an `iat` in the future is refused;
  - a key whose `key_ops` excludes `verify` and RSA keys under 2048 bits are ignored.

  On the web, `verifyIdToken` also takes a `createJwksCache` cache. A token that fails against the cached keys (rotation, no `kid`) triggers one throttled re-fetch. A new `maxAge` option bounds `iat`.
- **Strict inputs:**
  - `safeReturnTo` refuses paths that resolve or decode to `//host` (`/a/../..//evil`, `/%2F%2Fevil`);
  - passkey DER signatures must be canonical;
  - `sessionCookie` refuses names and values that would inject attributes;
  - `totp` and `verifyTotp` share `period` / `digits` options, and an empty secret throws.
- **Native:**
  - the stored session is keyed by client id and issuer;
  - `signOut({ endProviderSession: true })` after a relaunch now discovers the provider and ends its session.
- **Smaller public surface.** `timingSafeEqual`, `derToRaw`, `base32Encode`, `base32Decode`, `base64url`, `decodeBase64url`, `randomToken`, `tokenKid`, `fetchJwks` and `isRedirectFor` are no longer exported. Every remaining export is documented in the API reference.
- The npm tarball no longer ships the native test sources (`native/tests`).
