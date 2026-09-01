---
'@pyreon/native-compiler': patch
---

Announce a `false` permission that a wildcard grant will override on device

`<PermissionsProvider permissions={{ 'billing.**': true, 'billing.refunds.**': false }}>` bakes `PyreonPermissions(["billing.**"])` on both native targets, because the container is grant-only and an explicit `false` has nowhere to live. With no wildcard in the map that is exact — an unlisted key is denied either way — but under a wildcard the `false` is the ONLY thing denying the key, so dropping it INVERTS the decision: `can("billing.refunds.export")` is `false` on the web and `true` on device.

`permissionsProviderSeed` already computed `deniedUnderWildcard`, and its own docstring said the caller reports it. No caller did, so an authorization primitive was failing OPEN with zero warnings — the wrong direction to be wrong in, which is the standard this package already set for `can()` itself.

Both emitters now name the affected keys and state the direction ("DENIED on the web and GRANTED on device"), because "differs" would not tell an author whether the risk is a locked-out user or an unlocked one. An exact-key `false` with no wildcard stays silent — it loses nothing, and a warning there is the noise that gets real warnings ignored. Lowering the denies needs a change in both native containers and is not attempted here; what is closed is the silence.
