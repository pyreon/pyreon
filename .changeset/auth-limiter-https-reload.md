---
'@pyreon/auth': patch
---

Harden three auth edges found in the 0.54 pre-release audit.

`createAttemptLimiter` can no longer be bypassed by flooding it with distinct keys. Previously a full table evicted the oldest window even when that key was blocked, handing it a fresh budget — an attacker could get `max` guesses per flood instead of `max` per window. A full table now drops an expired window, else the least-used active one, and never one at its limit; when every slot is at its limit the new key is refused until the oldest window ends.

Explicit provider endpoints (`oauth2(...)`, `github`, `facebook`, or any metadata passed to `createAuth({ metadata })`) are now checked for https where they are used: `beginAuthorization` refuses an http authorization endpoint, and the code exchange and refresh refuse an http token endpoint before sending anything, with `insecure_url` — the same rule `discover` applies, including the loopback-http allowance for local development. The iOS and Android token exchange enforce it too.

Documented that a web `useOidc` session does not survive a reload (tokens are kept in memory, deliberately not in web storage) while native restores from the Keychain / Keystore, with the two supported ways to stay signed in.
