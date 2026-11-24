---
'@pyreon/zero': patch
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
---

The synthetic SSG/SSR entry a build writes into the app root now has a per-build name (`__pyreon-zero-ssg-entry-<pid>-<random>.js`). With one fixed name, two builds of the same root at once shared the file and the first to finish deleted it under the other (`Cannot resolve entry module …/__pyreon-zero-ssg-entry.js`). Scaffolded `.gitignore` files ignore `__pyreon-zero-ssg-entry*.js` / `__pyreon-zero-ssr-entry*.js`, which covers both forms.
