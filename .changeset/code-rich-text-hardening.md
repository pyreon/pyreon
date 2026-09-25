---
'@pyreon/code': minor
'@pyreon/rich-text': minor
---

Editor lifecycle and correctness fixes for both editor packages.

- A user-owned editor instance can be unmounted and mounted again; the second mount no longer renders an empty container.
- `@pyreon/code`: `dispose()` now stops the post-mount sync effects (they previously piled up across mount cycles and kept the editor alive); `highlightLine` / `setGutterMarker` and their clear counterparts take effect after mount; each tab of the tabbed editor keeps its own undo history; keybindings added before mount are kept and honour their handler's return value; a slow language load can no longer apply a stale grammar; `DiffEditor` follows `theme` / `language` changes; the tab bar has tab semantics and a focusable close button; fewer full-document string conversions per keystroke.
- `@pyreon/rich-text`: HTML-string content is parsed before mount, so `text()`, counts and `html()` are right from the start; `json.set` / `setContent` no longer enter undo history; new `placeholder` option, `readOnly` alias and `setContent()` method.

Behaviour change: programmatic content loads are no longer undoable.
