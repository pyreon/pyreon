---
'@pyreon/zero': patch
---

`imagePlugin`: resolve `?optimize` / `?component` imports importer-relative + alias-aware (the way Vite resolves `?url`).

`resolveId` embedded the raw, unresolved import id into the virtual id, so `load()` had to guess the path with cwd/`public` string math. Two documented patterns were broken (reported on bokisch.com, `@pyreon/zero@0.19.0`):

- `import x from './img.png?optimize'` — `load()` resolved `./img.png` against **cwd** (project root), not the **importer's** directory → `ENOENT` for the exact src-tree pattern the JSDoc advertises. (`?url` worked because Vite resolves it itself.)
- `import x from '~/assets/img.png?optimize'` (alias) — arrived already-absolute, then `join(root,'public',absPath)` **doubled** the path → `ENOENT`.

Only an image physically in `public/` imported as `/foo.png?optimize` worked.

Fix: `resolveId(id, importer)` now resolves the bare specifier via `this.resolve(bare, importer, { skipSelf: true })` (importer-relative + alias + extension resolution, identical to `?url`) and carries the **absolute** path through the virtual id. `load()` trusts an existing absolute path and only falls back to `<root>/public/…` for an unresolved leading-slash web path (`/foo.png?optimize`, where `this.resolve` returns null) — so that case keeps working. The same fix covers the SVG `?component` branch (same bug class).

Regression test `image-plugin-resolve.test.ts` (sharp-free): asserts the resolveId contract for relative + alias + public-path, and exercises `load()` end-to-end through the `?component` branch. Bisect-verified: reverting `resolveId` to the raw-id form fails 3/4 (the relative, alias, and load cases); restored → 4/4.
