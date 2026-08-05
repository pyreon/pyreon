---
'@pyreon/atlas': patch
'@pyreon/loom': patch
---

`@pyreon/atlas` now declares the two optional runtime peers it already imports: `@pyreon/vite-plugin` and `happy-dom`.

Both were devDependencies only, and both are loaded with a dynamic `import()` behind a graceful fallback — which is exactly what an optional peer is. `vite` and `playwright-core` were already declared that way; `@pyreon/vite-plugin` is imported in the *same* `try` block as `vite`, so a consumer who installed vite because the peer list asked them to still silently fell back to the runtime loader instead of the real compiler chain. `happy-dom`'s own failure message literally reads "install `happy-dom`", for a package nothing ever told the consumer to install. The declaration now matches the behaviour, so package managers surface it at install time.

The `loom scan` gate over this repo runs `--strict`, so a NEW dependency-fabric warning is red rather than scrollback. The repo's 18 warnings are at zero: the real ones fixed, and three verified false positives suppressed in the root `loom` config, each with a written `reason` (loom requires one). A backlog that reaches zero and is not gated refills — the same argument behind the lint ratchet.
