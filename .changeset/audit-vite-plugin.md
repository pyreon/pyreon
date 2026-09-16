---
'@pyreon/vite-plugin': minor
---

- New `include`/`exclude` options (the `createFilter` convention); by default third-party `node_modules` JSX is no longer transformed (only `@pyreon/*` packages are), so an untranspiled React `.jsx` dependency is not reinterpreted as Pyreon JSX.
- A signal store under `src/lib/` reaches the cross-module registry (the prescan skipped every `lib`/`dist`/`build` directory at any depth; only a package-root one is build output), and a plain `.ts` store is registered when transformed, not only by the boot-time prescan.
- The sanitizer auto-import is decided on the masked source in prop position only (a comment, a string or `el.innerHTML = ''` no longer pins the side-effect import) and is appended, so the compiler's source map is no longer shifted by a line.
- The signal-export registry recognises aliased Plain Mode markers (`import { state as s } from '@pyreon/core/plain'`) — an aliased store's exports were never registered, so a classic importer rendered the signal's source text; `.js`/`.mjs`/`.cjs`/`.cts` plain stores are transformed (only `.ts`/`.mts` were, while the prescan walked `.js`).
- Framework-file detection for compat mode is by package identity, so npm consumers are handled like the monorepo; the `ssrTemplate` capability probe resolves from the project root; the LPIH dev endpoint rejects cross-origin POSTs and validates `fires` entries.
