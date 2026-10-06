---
"@pyreon/vite-plugin": patch
---

Production SSR `process.env.NODE_ENV` fold no longer corrupts quoted occurrences. The fold was a raw `code.replaceAll`, so the define key `"process.env.NODE_ENV"` in zero's own server module (and any string, comment, regex literal or template text spelling it) became invalid JavaScript. It now folds only real `process.env.NODE_ENV` member-expression reads found by the parser, by position, and leaves assignment/update/delete targets alone; a module that does not parse keeps its runtime read. The react/preact compat `className`/`htmlFor` rename had the same raw-text flaw (it rewrote `const className = …`) and now renames only JSX attribute names.
