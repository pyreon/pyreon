---
'@pyreon/create-zero': patch
---

Scaffolded projects now get a `.gitignore` when created from the published package (npm never packs a file named `.gitignore`, so the template's was missing from the tarball), and it now also ignores the files Pyreon tooling writes into the app root: `.pyreon-lpih.json` and the temporary `__pyreon-zero-ssg-entry.js` / `__pyreon-zero-ssr-entry.js`.
