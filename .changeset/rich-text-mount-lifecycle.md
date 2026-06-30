---
"@pyreon/rich-text": patch
---

Harden the `@pyreon/rich-text` async-mount lifecycle — three correctness fixes in `createRichTextEditor`'s `_mount`/`dispose`, all confirmed in a real browser:

- **Dispose-during-pending-mount no longer leaks.** `_mount` lazy-imports `@tiptap/*`, so a `dispose()` (e.g. a fast navigate-away while the chunk loads) used to land while `view` was still `null` — `dispose()` no-op'd and the resolving import then created a live ProseMirror view + contenteditable DOM that nothing tore down. A `mountToken` generation counter (bumped by `dispose()` and any newer `_mount`) now aborts the in-flight mount cleanly.
- **Mount failures surface instead of crashing silently.** A broken extension set (e.g. `starterKit: false` with no schema-providing extension), a throwing extension, or a failed import used to become an unhandled promise rejection while the editor silently never mounted. The new `RichTextConfig.onError?: (error: Error) => void` receives the error; without it, a `[Pyreon]`-prefixed message is logged in development.
- **Re-mounting the same instance preserves edits.** Disposing then re-mounting (the documented user-owned lifecycle) used to reset the editor to the config-time `content`, dropping every edit. A re-mount now seeds from the current document.

No breaking changes — `onError` is additive and every existing behavior is unchanged. Regression-locked by three new real-Chromium specs (bisect-verified).
