---
'@pyreon/compiler': patch
---

Release pipeline: fix `release-native.yml` OIDC trusted publishing — remove the `.npmrc` that defeated it.

The Publish job correctly had no `NODE_AUTH_TOKEN`, but `actions/setup-node` was still invoked with `registry-url: 'https://registry.npmjs.org'`. setup-node writes a project `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` **whenever `registry-url` is set** — with no token in the env that line resolves to an empty `_authToken=`. npm then sees explicit (empty) registry auth and **skips the OIDC trusted-publishing exchange entirely**, so `npm publish` returns `404` on the PUT even when the package's trusted publisher is configured correctly. Provenance still signed (it uses the GitHub OIDC id-token directly, independent of npm registry auth), which masked the root cause and made the v0.18.0 native-publish failures look like an npmjs.com config problem.

Fix:
- Remove `registry-url:` from the `setup-node` step (no `.npmrc` auth line is written → npm performs the token-free OIDC exchange).
- Add an "Ensure npm supports OIDC trusted publishing" step (`npm install -g npm@latest`) — npm's native token-free trusted publishing landed in 11.5.1; Node 24's bundled npm can be older (24.x shipped 11.3.x).
- Belt-and-suspenders `rm -f` of any stray `.npmrc` (repo checkout / cached home) immediately before `npm publish`.
- Tightened the in-workflow comment to the exact trusted-publisher identity (`pyreon/pyreon` / `release-native.yml` / no environment) and the precise meaning of a 404.

YAML validated (parses; `setup-node.with` is now `{ node-version: 24 }` only; publish steps in correct order). This unblocks token-free native-binary publishing for the next release tag — no manual bootstrap needed once it lands (assuming the per-package trusted-publisher records match the identity above).
