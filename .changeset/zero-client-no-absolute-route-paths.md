---
'@pyreon/zero': patch
---

Production client bundles no longer contain the absolute path of each route file. The generated route module tagged every lazy route with `hmrId: "<absolute path>"` in every build; the id is only read by dev HMR and by the server, so a production client build now omits it. Before this, the build machine's directory layout shipped in public JavaScript and the bundle's bytes depended on where the project was checked out.
