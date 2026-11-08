---
'@pyreon/create-zero': patch
---

The `node` and `bun` adapter Dockerfiles now build and run.

The `node` Dockerfile ran `corepack prepare bun@latest` on `node:26-alpine`. Node 25+ no longer ships corepack and corepack never supported Bun, so `docker build` failed at the install step. It now builds in the official `oven/bun` image and runs on `node:26-alpine`.

Both images also copy production `node_modules` next to `dist/`. The server bundle imports the app's packages (`@pyreon/*` and the rest) at runtime: the node image crashed with `ERR_MODULE_NOT_FOUND`, and the bun image only started because Bun auto-installed the missing packages from npm on the first request, unpinned and only with network access.
