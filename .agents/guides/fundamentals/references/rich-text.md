# @pyreon/rich-text

- `createRichTextEditor({ content, ariaLabel, starterKit?, extensions?, onChange?, onError? })`:
  - `json` is a writable `Signal<JSONContent>` (`.set()` is loop-safe).
  - Computed: `html`, `text`, `isEmpty`, `characterCount`, `wordCount`, `canUndo`, `canRedo`. `editable` is a writable toggle. `isActive(name)` is the reactive toolbar primitive.
  - `chain()` escape hatch, plus `undo`/`redo`/`focus`/`blur`.
- `<RichText instance={editor}>` lazy-loads TipTap and renders `role="textbox"` with the aria label. `bindRichTextToSignal({ editor, signal, format })` binds json or html two ways.
- `onError` receives mount failures. Dispose during the async mount is leak-safe (`mountToken` guard). Re-mounting the same instance keeps the current document, not the config's initial content.
- `characterCount`, `wordCount` and `isEmpty` are computed from the document JSON (`baseJson`), not the mounted engine. They work before mount and after dispose, and count visible characters (not `getText()`'s block separators).
- Two transaction counters: `docVersion` (on `onUpdate`) and `selectionVersion` (on `onSelectionUpdate`). Content computeds read `docVersion` only, so a cursor move does not re-run them; `isActive` reads both.
- Bench: `bun scripts/bench/rich-text.ts`.
- Collaboration composes with `@pyreon/sync` through optional peers (`@tiptap/extension-collaboration`, `y-prosemirror`). Use MIT TipTap packages only (no TipTap Pro). Lifecycle is user-owned.
- Browser behaviour is locked by `src/tests/rich-text.browser.test.tsx`.
