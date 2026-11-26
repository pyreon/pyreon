---
'@pyreon/cli': patch
---

`pyreon add @pyreon/atlas` and `pyreon add @pyreon/loom` print the dev dependencies their `dev` and `build` commands need (`vite`, `@pyreon/vite-plugin`, `@pyreon/zero`) as an install line for the project's own package manager.
