---
'@pyreon/loom': patch
---

Scanner correctness fixes in `loom scan`:

- `lib/` and `dist/` are skipped only at a package's root. A nested `src/lib/` is ordinary source and is now scanned, so dependencies used only there are no longer reported as `unused-dep` and undeclared imports there are no longer missed.
- A `package.json` that exists but is not valid JSON now fails the scan with `[Pyreon] loom: <path> is not valid JSON: <reason>`. Previously a malformed member was silently dropped (its siblings then saw it as an external package) and a malformed root was reported as "no package.json".
- `typeof import('x')` is recognized as a type query, not a runtime import.
- Identifiers or methods that merely end in a keyword (`myrequire('x')`, `reimport('x')`, `loader.import('x')`) are no longer recorded as imports.
- `!negation` workspace globs are matched as globs, not literal paths.
- `pnpm-workspace.yaml` is read for the `packages:` key only (block or flow form); lists under other keys such as `onlyBuiltDependencies` no longer become workspace globs.
- A dependency declared in both `dependencies` and `peerDependencies` produces one graph edge instead of two.
- A package whose root `tsconfig*.json`, or a `.json` it publishes through `exports`, sets `compilerOptions.jsxImportSource` now counts that package as used, so a TypeScript preset package is no longer told its JSX runtime dependency is unused.
