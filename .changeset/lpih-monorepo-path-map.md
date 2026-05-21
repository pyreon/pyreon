---
'@pyreon/lint': minor
---

LPIH: `PYREON_LPIH_PATH_MAP` env var for remote-dev path remapping. In Codespaces, devcontainers, Docker dev, or any setup where the runtime captures paths from one filesystem view (e.g. `/host/proj/src/x.ts`) while the LSP serves files from another (`/workspaces/proj/src/x.ts`), inlay hints used to stay invisible — fire-data file paths never matched the LSP's source-file path.

Now: `PYREON_LPIH_PATH_MAP=/host/proj=/workspaces/proj pyreon-lint --lsp` rewrites captured paths inside `_readLpihCache` before matching. Multiple mappings via `;` (longest `from` wins; malformed entries silently dropped). The runtime side stays untouched — it keeps capturing its native filesystem paths.

Closes R7 from the LPIH foundation PR (#769) recommendations queue. Bisect-verified: disabling the path-map rewrite in `_readLpihCache` fails 3 of the 53 LSP-LPIH specs (`rewrites file paths via PYREON_LPIH_PATH_MAP-style source`, `applies longest-prefix-wins across multiple rules`, `reads PYREON_LPIH_PATH_MAP from process.env by default`); restored → 53/53. Exposed surface: `_parseLpihPathMap`, `_applyLpihPathMap`, `LPIHPathMapEntry` (`@internal` underscore-prefixed for tests, not stable public API).
