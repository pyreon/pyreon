---
'@pyreon/reactivity': patch
---

Release pipeline: `release-native.yml` Publish step now uses npm OIDC trusted publishing instead of `NODE_AUTH_TOKEN`.

The prior shape (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`) resolved to empty string because the repo doesn't store an `NPM_TOKEN` secret — Pyreon's main release flow works without one because `changesets/action` does the OIDC exchange internally, but `release-native.yml`'s raw `npm publish` doesn't. setup-node then wrote `_authToken=` (empty) into `.npmrc`, and npm tried to use the empty token, failing with `ENEEDAUTH` instead of falling back to OIDC.

Removing the env line lets npm 11+ (shipped with Node 24) perform the OIDC token exchange natively, with `id-token: write` already granted at the workflow level. No long-lived secret stored anywhere; per-publish tokens are scoped to workflow + package + commit SHA, and published tarballs gain provenance attestations.

**Pre-registration required** (one-time per package, see `CONTRIBUTING.md`): the 7 `@pyreon/compiler-<triple>` packages must be registered as trusted-publisher targets on npmjs.com before their first publish. npmjs.com supports configuring trusted publishing for packages that don't yet exist — the first publish creates them.
