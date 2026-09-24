---
'@pyreon/atlas': patch
---

Resolve an undeclared package subpath that names a DIRECTORY to the index file inside it, not to the directory. The workspace resolver's fallback walk tested `<pkg>/<subpath>` with a bare `existsSync`, which a directory satisfies, so `@acme/core/utils` against a package shipping `utils/index.js` handed the loader the directory and the import failed as `UNLOADABLE_DEPENDENCY`. The walk now requires a file, matching the sibling resolver that already did.
