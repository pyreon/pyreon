---
'@pyreon/reactivity': patch
---

Release pipeline: `release-native.yml` Publish step now uses npm OIDC trusted publishing instead of `NODE_AUTH_TOKEN`.

The prior shape (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`) resolved to empty string because the repo doesn't store an `NPM_TOKEN` secret — Pyreon's main release flow works without one because `changesets/action` does the OIDC exchange internally, but `release-native.yml`'s raw `npm publish` doesn't. setup-node then wrote `_authToken=` (empty) into `.npmrc`, and npm tried to use the empty token, failing with `ENEEDAUTH` instead of falling back to OIDC.

Removing the env line lets npm 11+ (shipped with Node 24) perform the OIDC token exchange natively, with `id-token: write` already granted at the workflow level. No long-lived secret stored anywhere; per-publish tokens are scoped to workflow + package + commit SHA, and published tarballs gain provenance attestations.

**One-time manual bootstrap required** (see `CONTRIBUTING.md` → "Native binary publishing"): the 7 `@pyreon/compiler-<triple>` packages have never been published, and npm trusted publishing is configured on a package's own settings page — it **cannot** be set up for a package that doesn't exist yet (npm has no account/org-level pre-registration flow). The OIDC path here works for every release *after* a one-time manual first publish brings the 7 packages into existence; trusted publishing is then configured per-package and all subsequent releases are automated. `scripts/bootstrap-native-publish.ts` stages the CI-built binaries and prints the manual publish commands.
