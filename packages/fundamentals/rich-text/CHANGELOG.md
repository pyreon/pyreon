# @pyreon/rich-text

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/runtime-dom@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/runtime-dom@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`b15b4b5`](https://github.com/pyreon/pyreon/commit/b15b4b5b823c85babc07b9250bc4fa39a4b22d31), [`a0c82c3`](https://github.com/pyreon/pyreon/commit/a0c82c3270a8e89e69d88046b590f04588f6802f), [`16f2ad1`](https://github.com/pyreon/pyreon/commit/16f2ad130f7ba1fd0e821bf28bc59fe49787790b), [`9562f24`](https://github.com/pyreon/pyreon/commit/9562f2489e1d7176dd41b1ec52fe0fb39568b100), [`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/runtime-dom@0.39.0
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Minor Changes

- [#1866](https://github.com/pyreon/pyreon/pull/1866) [`b8b7a8a`](https://github.com/pyreon/pyreon/commit/b8b7a8a99c26a137d438abe4e13ed4cc8e9eae7d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `@pyreon/rich-text` — a reactive WYSIWYG rich-text editor built as a thin
  signal-backed layer over TipTap (MIT, framework-agnostic, ProseMirror-based),
  the same adapter shape as `@pyreon/code` (CodeMirror) and `@pyreon/charts`
  (ECharts).

  - `createRichTextEditor(config?)` — reactive instance; `editor.json` is a
    writable `Signal<JSONContent>`, with computed `html` / `text` / `isEmpty` /
    `characterCount` / `canUndo` / `canRedo`.
  - `<RichText instance={editor} />` — mount component; lazy-loads `@tiptap/*` on
    first render so the engine stays out of the initial bundle. The content area
    is a labeled `role="textbox"` multiline region (configurable `ariaLabel`).
  - `bindRichTextToSignal({ editor, signal, format })` — two-way binding (`json`
    or `html`) with built-in loop prevention, mirroring
    `@pyreon/code`'s `bindEditorToSignal`.

  MIT throughout (TipTap + ProseMirror). Real-time collaboration composes with
  `@pyreon/sync` (bind to the same `Y.Doc` XML fragment) — no paid cloud.

- [#1871](https://github.com/pyreon/pyreon/pull/1871) [`fb4d884`](https://github.com/pyreon/pyreon/commit/fb4d8847a7c41536cb1b42861fb4d8f8f2f89320) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/rich-text`: toolbar-completeness API + exhaustive docs & demo.

  - `editor.isActive(name, attrs?)` — reactive toolbar primitive for active-state
    highlighting (`isActive('bold')`, `isActive('heading', { level: 2 })`).
  - `editor.editable` — writable `Signal<boolean>` for a runtime read-only toggle.
  - `editor.wordCount` computed; `editor.undo()` / `editor.redo()` / `editor.blur()`
    helpers alongside the existing `chain()` escape hatch.
  - Exhaustive conceptual guide at `docs/rich-text` (editor API, toolbars,
    read-only, counts, two-way binding, extensions, a11y, collaboration via
    `@pyreon/sync`, SSR note) + a full-featured `fundamentals-playground` demo.

### Patch Changes

- [#1914](https://github.com/pyreon/pyreon/pull/1914) [`fe58eb6`](https://github.com/pyreon/pyreon/commit/fe58eb6ddc5aa2f087496eb0dc36021962a59677) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Harden the `@pyreon/rich-text` async-mount lifecycle — three correctness fixes in `createRichTextEditor`'s `_mount`/`dispose`, all confirmed in a real browser:

  - **Dispose-during-pending-mount no longer leaks.** `_mount` lazy-imports `@tiptap/*`, so a `dispose()` (e.g. a fast navigate-away while the chunk loads) used to land while `view` was still `null` — `dispose()` no-op'd and the resolving import then created a live ProseMirror view + contenteditable DOM that nothing tore down. A `mountToken` generation counter (bumped by `dispose()` and any newer `_mount`) now aborts the in-flight mount cleanly.
  - **Mount failures surface instead of crashing silently.** A broken extension set (e.g. `starterKit: false` with no schema-providing extension), a throwing extension, or a failed import used to become an unhandled promise rejection while the editor silently never mounted. The new `RichTextConfig.onError?: (error: Error) => void` receives the error; without it, a `[Pyreon]`-prefixed message is logged in development.
  - **Re-mounting the same instance preserves edits.** Disposing then re-mounting (the documented user-owned lifecycle) used to reset the editor to the config-time `content`, dropping every edit. A re-mount now seeds from the current document.

  No breaking changes — `onError` is additive and every existing behavior is unchanged. Regression-locked by three new real-Chromium specs (bisect-verified).

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/runtime-dom@0.38.0
  - @pyreon/core@0.38.0
