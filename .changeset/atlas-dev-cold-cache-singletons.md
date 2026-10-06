---
'@pyreon/atlas': patch
---

`atlas dev` no longer loads a workspace-only `@pyreon/*` package (for example `@pyreon/store`, declared by a component package but not the root manifest) through both a raw and an optimized URL on a cold dependency cache. The Pyreon Vite plugin only excludes the packages the root manifest declares from the optimizer, so the first preview hit the singleton sentinel ("Multiple instances of @pyreon/store") and failed to load, while a warmed cache worked. The workbench now excludes and dedupes every `@pyreon/*` package any workspace package declares or links, derived from the workspace rather than a fixed list. Fixes #3846.
