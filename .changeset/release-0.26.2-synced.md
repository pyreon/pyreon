---
"@pyreon/reactivity": patch
---

**Synced 0.26.2 release** — first release after the release-pipeline hardening sequence (#1160–#1163).

This release brings every publishable `@pyreon/*` package onto the same version trajectory and finalizes the bootstrap of 4 newly-published packages:

- **Mainline 62 packages**: `0.26.1` → `0.26.2` (patch — no user-facing behavior change since 0.26.1; this release is the structural sync)
- **Newly-bootstrapped packages**: catch up to the synced version
  - `@pyreon/validate`: `0.26.0` → `0.26.2`
  - `@pyreon/svelte-compat`: `0.17.0` → `0.26.2` (large jump — joins the framework's synced version line)
  - `@pyreon/primitives`: `0.1.0` → `0.26.2` (large jump — joins as part of PMTC Phase A)
  - `@pyreon/create-multiplatform`: `0.0.0` → `0.26.2` (first numbered release)
- **Native compiler binaries (7)**: catch up from `0.24.2` to `0.26.2` via `release-native.yml` firing on the umbrella `v0.26.2` tag — closes the gap that opened when PR #1153's cascade prevented the v0.26.1 tag from being pushed.

After this release: all 66 publishable `@pyreon/*` packages on npm at one synced version. The release pipeline is now drift-protected by the `Release Readiness` CI gate (#1162) and self-healing against future first-publish 404s (#1161).
