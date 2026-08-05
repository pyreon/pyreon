---
'@pyreon/atlas': patch
'@pyreon/mcp': patch
---

Fix two defects that made `atlas build` unusable against any real package, and publish the workbench at pyreon.dev/atlas.

`atlas build` shipped in 0.50.0 but only worked against a project that happened to declare `@pyreon/atlas` as its own dependency — in this repo, exactly one example. Two bugs, both found by pointing it at a real 108-component library:

- **`@pyreon/atlas` itself was unresolvable.** The generated entry lives in `<project>/node_modules/.atlas-build/` and imports `@pyreon/atlas/ui`. Resolution walks up looking for `node_modules/@pyreon/atlas`, and a package manager never links a package inside its own `node_modules` — so every framework package resolved and the workbench did not (`Rolldown failed to resolve import "@pyreon/atlas/ui"`). A component library never declares the workbench; you point the tool at it. Now resolved through the workspace's own package map, and only ever for Atlas's generated modules.
- **A subpath resolved to a directory instead of a file.** `resolveWorkspaceSpecifier` probed the bare extension first and used an existence check, so a barrel `src/ui.ts` next to its `src/ui/` folder matched the folder (`UNLOADABLE_DEPENDENCY: Could not load .../src/ui`). `@pyreon/atlas/ui` is exactly that shape.

Both are bisect-verified. Verified end to end against `@pyreon/ui-components`: 108 components build and render in real Chromium with zero console errors, and the baked RPC is real — 108/108 source entries, 108/108 Lens verdicts, 9 carrying findings, 0 bake failures.

Also gives the built site real URLs. `atlas build` now emits a directory per component, so `/atlas/button/` is a page a plain file server answers at — pasteable into a chat, bookmarkable, linkable from a design doc — instead of `/atlas/?c=button`. The workbench reads its own path (base-agnostic: it matches the last segment against the catalog, so it works under any `--base`) and writes the path back on navigation, with the component removed from the query so the two can never disagree.

Opt-in via a global the host sets, because writing a path is only safe where a page answers at it: `atlas build` sets it, `atlas dev` sets it (its middleware already serves the shell for any extensionless GET), and a workbench EMBEDDED in someone else's app sets nothing and keeps the query string — writing `/button/` there would 404 on reload. Skipped for a relative `--base`, which would resolve assets against the wrong directory, and it says so rather than emitting pages that cannot load their own JavaScript.

Honest limit: these are real URLs, not prerendered pages. The HTML body is empty until JavaScript runs, so a crawler sees the title and nothing else — rendering the component into the HTML needs SSR, which is a different change.
