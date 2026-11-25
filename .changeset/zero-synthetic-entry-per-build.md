---
'@pyreon/zero': patch
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
---

The synthetic SSG/SSR entry a build writes is now in Vite's `cacheDir`, not the app root, under a per-build name (`__pyreon-zero-ssg-entry-<pid>-<random>.js`); its bare imports still resolve as if from the root. The root can be read-only (an app shipped inside an installed package under Yarn PnP or a Nix store) and is the user's working tree. With one fixed name, two builds of the same root at once also shared the file, and the first to finish deleted it under the other (`Cannot resolve entry module …/__pyreon-zero-ssg-entry.js`). Scaffolded `.gitignore` files ignore `__pyreon-zero-ssg-entry*.js` / `__pyreon-zero-ssr-entry*.js`, which covers both forms.
