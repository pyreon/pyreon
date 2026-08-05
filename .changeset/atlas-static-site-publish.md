---
'@pyreon/atlas': patch
---

Fix three defects that made `atlas build` unusable against any real package, and publish the workbench at pyreon.dev/atlas.

`atlas build` shipped in 0.50.0 but only worked against a project that happened to declare `@pyreon/atlas` as its own dependency — in this repo, exactly one example. Three bugs, each found by pointing it at a real 108-component library:

- **`@pyreon/atlas` itself was unresolvable.** The generated entry lives in `<project>/node_modules/.atlas-build/` and imports `@pyreon/atlas/ui`. Resolution walks up looking for `node_modules/@pyreon/atlas`, and a package manager never links a package inside its own `node_modules` — so every framework package resolved and the workbench did not (`Rolldown failed to resolve import "@pyreon/atlas/ui"`). A component library never declares the workbench; you point the tool at it. Now resolved through the workspace's own package map, and only ever for Atlas's generated modules.
- **A subpath resolved to a directory instead of a file.** `resolveWorkspaceSpecifier` probed the bare extension first and used an existence check, so a barrel `src/ui.ts` next to its `src/ui/` folder matched the folder (`UNLOADABLE_DEPENDENCY: Could not load .../src/ui`). `@pyreon/atlas/ui` is exactly that shape.
- **`--out` resolved against the scanned project, not the shell.** `atlas build packages/ui/components --out docs/dist/atlas` emitted into `packages/ui/components/docs/dist/atlas`, silently and with a success message. An explicit `--out` now follows the cwd like every other CLI; the default `atlas-dist` still sits beside the project it documents.

All three are bisect-verified. Verified end to end against `@pyreon/ui-components`: 108 components build and render in real Chromium with zero console errors, and the baked RPC is real — 108/108 source entries, 108/108 Lens verdicts, 9 carrying findings, 0 bake failures.
