---
"@pyreon/mcp": patch
---

docs(mcp): expand api-reference coverage for recent zero/head/reactivity APIs

The published MCP server's `get_api` now answers for the image / font /
resource-hint / head-defer / wrapSignal features merged since 2026-06-01.
Adds entries — zero: `createImageRegistry`, `NoOptimize`, `useNoOptimize`,
`imagePlugin`, `usePreloadFont`, `inferFontMimeType`, `PreloadFontOptions`,
`fontPlugin`, `fontImportPlugin`, `FontDescriptor`, `usePreconnect`,
`useDnsPrefetch`, `usePreload`, `PreloadOptions`; reactivity: `wrapSignal`,
`WrapSignalOptions`; head: `ScriptTag` — and refreshes the stale `<Image>`
entry to the bi-modal `src` (descriptor | URL) + `optimize` form. Generated
from the source manifests via `bun run gen-docs`.

(The companion `src/manifest.ts` changes in `@pyreon/head` / `@pyreon/reactivity`
/ `@pyreon/zero` are gen-docs-only — `manifest.ts` is tree-shaken from each
package's published `lib/`, so those packages ship no consumer-facing change.)
