# @pyreon/code

- `createEditor({ value, language, theme, onError?, ... })`: `value` is a writable `Signal<string>`; `cursor`, `selection`, `lineCount` are computed. Components `<CodeEditor>`, `<DiffEditor>`, `<TabbedEditor>` (plus `createTabbedEditor`). Lifecycle is user-owned: call `editor.dispose()`.
- `bindEditorToSignal({ editor, signal, serialize, parse, onParseError? })` binds two ways.
- CodeMirror 6. Grammars load through a registry (`src/languages.ts`): the core registers only `plain`, the JavaScript family (js/ts/jsx/tsx) and JSON. Import `@pyreon/code/languages-all` for the full set, or add one with `registerLanguage(id, () => import(…))`. A single static map of every grammar made bundler dependency scanners pre-bundle the whole language ecosystem.
- Bundle bench: `bun run --filter=@pyreon/code bench` (core editor is at parity with `@uiw/react-codemirror`; each grammar is a lazy chunk).
- `onError` receives mount failures (a throwing extension, a failed grammar import) instead of an unhandled rejection. Dispose during the async mount is leak-safe (`mountToken` guard); `<DiffEditor>` unmount during grammar load is leak-safe (`unmounted` guard).
- `foldAll`/`unfoldAll` are static imports from `@codemirror/language`. Never `require()` in this ESM package — it throws in every browser bundle.
- The minimap detects dark mode with `view.state.facet(EditorView.darkTheme)`. CM6 uses hashed classes, so a `cm-dark` class check never matches.
- Both of the above are browser-only failures; `src/tests/code.browser.test.tsx` locks them.
- Peer dependency: `@pyreon/runtime-dom`.
