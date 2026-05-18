---
'@pyreon/compiler': patch
---

Release pipeline: `scripts/publish.ts` now resolves `workspace:` ranges in `optionalDependencies` (previously only `dependencies` / `peerDependencies` / `devDependencies` were resolved).

`@pyreon/compiler` is the only package using `optionalDependencies` — its 7 per-platform native-binary packages (`@pyreon/compiler-<triple>`). Because that 4th field was never passed through `resolveWorkspaceDeps()`, `@pyreon/compiler@0.18.0` shipped to npm with `optionalDependencies: { "@pyreon/compiler-darwin-arm64": "workspace:^", … }` — the literal pnpm/bun workspace protocol. Effect: `npm i @pyreon/compiler@0.18.0` **hard-fails for every consumer** with `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"` — npm rejects the manifest while parsing, before it can skip an *optional* dependency. The 0.18.0 compiler is therefore uninstallable standalone (and the 7 native binaries it points at can never resolve).

Fix is the missing 4th field plus a defense-in-depth guard: after building the resolved manifest, `publish.ts` scans every dependency field and **hard-fails before write/publish** if any `workspace:` range remains — so a future package.json field added without updating the resolve list can't silently ship another broken release (exactly how `optionalDependencies` slipped through). A broken publish is immutable and unrecoverable, so the gate must be pre-publish.

Bisect-proven against the real `packages/core/compiler/package.json`: before → 7× `workspace:^`; after → 7× `^0.18.0`; guard passes on resolved input and exits 1 on any residual `workspace:`. npm 0.18.0 is immutable and stays broken (deprecate it); this makes the next release's `@pyreon/compiler` installable.
