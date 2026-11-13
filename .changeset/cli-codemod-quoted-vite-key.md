---
"@pyreon/cli": patch
---

`pyreon upgrade`'s `zero-remove-vite-option` codemod now also removes a `vite` option written as a shorthand property or a quoted key (`zero({ 'vite': ... })`). Its pre-check only looked for an unquoted `vite:`, so those two forms were skipped even though the rewrite handled them.
