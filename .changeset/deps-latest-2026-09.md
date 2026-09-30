---
"@pyreon/compiler": patch
"@pyreon/code": patch
"@pyreon/dnd": minor
"@pyreon/query": patch
"@pyreon/rich-text": patch
"@pyreon/sync": patch
"@pyreon/table": patch
"@pyreon/native-compiler": patch
"@pyreon/lint": patch
"@pyreon/mcp": patch
"@pyreon/zero-cli": patch
"@pyreon/zero-content": patch
"@pyreon/zero": patch
---

Dependency refresh to latest. `@pyreon/dnd` moves to `@atlaskit/pragmatic-drag-and-drop` 4 and `-hitbox` 3 (the auto-scroll adapter already required core 4, so v3 core would have been installed twice). Runtime deps of the other packages move to their latest in-major releases (`oxc-parser` 0.152, `magic-string`, `@tanstack/query-*` 5.104, CodeMirror, tiptap, `yjs`, `sharp`, `vite`, …).
