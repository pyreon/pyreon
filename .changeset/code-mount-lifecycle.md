---
"@pyreon/code": patch
---

Harden the `@pyreon/code` async-mount lifecycle — two correctness fixes confirmed in a real browser, mirroring the `@pyreon/rich-text` fix:

- **Dispose-during-pending-mount no longer leaks.** `createEditor`'s `mount()` lazy-loads the language grammar, so a `dispose()` (e.g. a fast navigate-away while the grammar loads) used to land while `view` was still `null` — `dispose()` no-op'd and the resolving import then created a live CodeMirror view + DOM that nothing tore down. A `mountToken` generation counter (bumped by `dispose()`) now aborts the in-flight mount. The same shape in `<DiffEditor>` (unmount during the async grammar load left a leaked `MergeView`) is fixed with an `unmounted` guard.
- **Mount failures surface instead of crashing silently.** A throwing extension or a failed grammar import used to become an unhandled promise rejection while the editor silently never mounted. The new `EditorConfig.onError?: (error: Error) => void` (and `DiffEditorProps.onError`) receives the error; without it, a `[Pyreon]`-prefixed message is logged in development.

No breaking changes — `onError` is additive and existing behavior is unchanged. Regression-locked by three new real-Chromium specs (createEditor leak + onError, DiffEditor leak), each bisect-verified.
