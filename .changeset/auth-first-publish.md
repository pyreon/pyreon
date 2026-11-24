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
  - The native compiler warns about two issuers on one `nativeRedirectUri` in a file. Use one per provider (`com.example.app:/oauth/google`).
  - `dispose()` releases an instance's claim: `useOidc` on unmount, the iOS container on deinit, `rememberPyreonOidcAuth` when it leaves the composition. A disposed instance that signs in again registers again.
  - The callback must arrive at the flow's own redirect URI (`redirect_mismatch`). The matching rule is now the same on all three targets: scheme and host lowercased, default ports dropped, dot segments resolved, the path otherwise as written; a backslash, whitespace, a percent-encoded dot or authority, or anything non-ASCII before the query is refused (write internationalised hosts in punycode).
  - A flow started for another issuer or client is refused (`issuer_mismatch`).
- **Redirect URIs fail closed.** A callback whose URL, or a configured redirect URI, the matcher refuses never matches. A redirect URI the matcher refuses (non-ASCII host — use punycode —, a percent-encoded dot, backslash or whitespace) throws in `createAuth`, fails `beginAuthorization` with `invalid_redirect_uri`, starts the native container in `error`, and is refused by the native compiler.
- **A failed refresh keeps the session when the provider is unreachable or unavailable** (`network_error`, `provider_unavailable` for 429 / 5xx, `discovery_failed`, `jwks_failed`): `status` is `error` with that code and `refresh()` retries; on iOS and Android the stored session is kept, so an offline launch no longer signs the user out. Any other refresh failure ends the session.
- **Native expired sessions.** A restored session whose access token has expired is `signingIn` until its refresh completes and never exposes the expired token. The refresh starts when the screen appears (iOS: the compiler emits `.onAppear { auth.start() }`; Android: when `rememberPyreonOidcAuth` enters the composition, which also takes the redirect-URI claim). `freshAccessToken()` returns a token refreshed first when needed. A refresh adopts another instance's stored session only for the same user, and never into a signed-out instance.
- **Server callbacks behind a proxy.** `handleCallback` accepts the request's path and query (Node's `req.url`) and resolves it against the configured redirect URI's origin; forwarded headers are never read. A path passed to `parseCallback` fails with `invalid_callback` instead of a `TypeError`.
- **`response_mode` is reserved** (`form_post` would drop the `SameSite=Lax` binding cookie on the cross-site POST).
- **Refresh, on the web, iOS and Android.** Concurrent `refresh()` calls share one request, so an already-rotated refresh token is never presented again (providers with reuse detection revoked the session); natively this holds process-wide for every instance over one stored session, and a restored, expired session is refreshed on first use instead of in the initializer (SwiftUI and Activity recreation construct extra instances). A refresh no longer discards a sign-in in flight, never overwrites a newer session, and a call after a sign-out and new sign-in refreshes the new session.
- **ID tokens, on all three targets:**
  - `azp` must be this client whenever it is present;
  - an `iat` in the future is refused;
  - a key whose `key_ops` excludes `verify` and RSA keys under 2048 bits are ignored.

  On the web, `verifyIdToken` also takes a `createJwksCache` cache. A token that fails against the cached keys (rotation, no `kid`) triggers one throttled re-fetch. A new `maxAge` option bounds `iat`.
- **Strict inputs:**
  - `safeReturnTo` refuses paths that resolve or decode to `//host` (`/a/../..//evil`, `/%2F%2Fevil`, `;` path parameters, more than three layers of encoding);
  - passkey DER signatures must be canonical;
  - `sessionCookie` refuses names and values that would inject attributes;
  - `totp` and `verifyTotp` share `period` / `digits` options, and a secret under 128 bits throws. **Behaviour change:** existing 80-bit enrolments need `allowShortSecret: true`.
- **Native:**
  - the stored session is keyed by client id and issuer;
  - `signOut({ endProviderSession: true })` after a relaunch now discovers the provider and ends its session.
- **Smaller public surface.** `timingSafeEqual`, `derToRaw`, `base32Encode`, `base32Decode`, `base64url`, `decodeBase64url`, `randomToken`, `tokenKid`, `fetchJwks` and `isRedirectFor` are no longer exported. Every remaining export is documented in the API reference.
- The npm tarball no longer ships the native test sources (`native/tests`).
