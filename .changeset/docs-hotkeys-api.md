---
"@pyreon/hotkeys": patch
"@pyreon/mcp": patch
---

docs(hotkeys): document the 7 missing imperative + utility exports in the manifest — the reference-counted scope API (`enableScope`/`disableScope`/`getActiveScopes`), `getRegisteredHotkeys`, and the combo utilities (`parseShortcut`/`matchesCombo`/`formatCombo`). All signatures and footguns are source-verified: scope enable/disable is refcounted (`'global'` immutable, server no-op, must balance acquire/release); `getActiveScopes` returns the live signal; `getRegisteredHotkeys` is a snapshot; `matchesCombo` skips Shift-enforcement for symbol keys (so `?` matches Shift+/); `parseShortcut`'s `mod` is META on Mac / CTRL elsewhere; `formatCombo` renders the ⌘ glyph on Mac and is display-only (not round-trippable). Regenerates the MCP api-reference + docs-site reference page.
