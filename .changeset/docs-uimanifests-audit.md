---
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
'@pyreon/atlas': patch
'@pyreon/lathe': patch
'@pyreon/lint': patch
'@pyreon/loom': patch
---

Docs/manifest accuracy pass over the ui-system and tools packages — no runtime changes.

- `@pyreon/ui-core`: manifest grew from 6 to 18 `api[]` entries, now covering every real export — `init`, the descriptor-safe `get`/`set`/`merge`/`pick`/`omit`/`isEmpty`/`isEqual` utilities, `throttle`, `compose`, `resolveSlot`, `isPyreonComponent`, `render`, `useStableValue`, `HTML_TAGS`/`HTML_TEXT_TAGS`, the `getThemeEngine`/`setThemeEngine` theme-engine registration seam, and `resolveCssVariables`. The deprecated internal `Provider`/`context` are now called out in `gotchas`.
- `@pyreon/unistyle`: manifest grew from 11 to 14 entries — added `values`, and the Custom-Property Style Extraction (CPSE) primitives (`cpseRewrite`/`cpseVarName`/`extractStyleVar`, `cpseStyled`) that were previously undocumented despite backing the `styleExtraction: true` opt-in.
- `@pyreon/atlas`: added `atlas init`, `atlas check`, and `defineAtlas` manifest entries — three real CLI/API surfaces that had zero documentation on the manifest or the docs site. Corrected `defineAtlas`'s description: it types `createAtlas()`'s programmatic options, not the wider `atlas.config.ts` file convention (a real, easy-to-hit type mismatch if conflated).
- `@pyreon/lathe`: added `resolveProjects`, `resolveTransform`, and `worstVerdict` manifest entries (referenced in existing examples but previously undocumented).
- `@pyreon/lint`: added the `lintAsync` manifest entry (the worker-pool sibling of `lint()`, used by the CLI itself for large runs).
- `@pyreon/loom`: added the `loom build` manifest entry — a real, shipped CLI command (static-site export of the observatory) that was missing from both the manifest and the docs site.

Docs-site fixes:

- `docs/elements.md`: documented the previously-unexplained `contentDirection`/`contentAlignX`/`contentAlignY` trio (governs a SIMPLE Element's layout, default `'rows'`) and the per-slot `beforeContentDirection`/`afterContentDirection` trio, and clarified that the existing `direction`/`alignX`/`alignY` props only apply once `beforeContent`/`afterContent` make an Element compound — passing `direction` alone on a simple Element was silently a no-op with no explanation anywhere in the docs.
- `docs/ui-core.md`: added the theme-engine registration seam section (`getThemeEngine`/`setThemeEngine`) and fixed a broken internal anchor link.
- `docs/atlas.md`: added `atlas init` and `atlas check` sections — both real, documented-in-`--help` commands with zero prior coverage; renamed the stale "The four commands" heading (five sub-sections were already documented, plus two more added here).
- `docs/loom.md`: added the `loom build` section.
- `docs/lathe.md`: added the `lathe pull` section and a full CLI flags reference (`--target`, `--base-url`, `--client`, `--validator`, `--strict-native`, `--fail-on-breaking`, `--watch`), none of which were previously documented on the docs site despite being real, shipped flags.
