---
"@pyreon/rich-text": patch
"@pyreon/sync": patch
"@pyreon/create-zero": patch
"@pyreon/zero-content": patch
---

Update external runtime dependencies to latest (safe batch): @tiptap/* 3.28.0, ws 8.21.1, shiki 4.3.1, @clack/prompts 1.7.0. No API changes. (vite stays held at 8.0.16 tree-wide — 8.1.x breaks the zero-content compiled-JSX test pipeline; see PR for the bisect.)
