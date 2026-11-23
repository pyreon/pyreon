---
'@pyreon/auth': minor
---

`@pyreon/auth` is published to npm for the first time. It is **Experimental**: its API may change in a minor release.

Security fixes made before the first publish:

- **OAuth mix-up between two providers on one redirect page.** Pending sign-ins are looked up by `state`, and every `useOidc` / `createAuth` on the redirect page sees the callback. An instance could complete another provider's sign-in and post that provider's authorization code and PKCE verifier to its own token endpoint, whenever the callback carried no RFC 9207 `iss` (most providers send none). An instance now completes only a flow started for its own issuer and redirect URI and hands any other flow back to the store untouched. `parseCallback`, and the native `PyreonAuthCore.complete` on iOS and Android, refuse a flow started for another issuer with `issuer_mismatch`.
- **Native provider logout after a relaunch.** On iOS and Android, `signOut({ endProviderSession: true })` did nothing at the provider when the session had been restored from the Keychain / Keystore, because the provider had not been discovered in that run. It now discovers the provider first, so the provider session ends as documented.
- The npm tarball no longer ships the native test sources (`native/tests`).
