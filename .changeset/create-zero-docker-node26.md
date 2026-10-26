---
'@pyreon/create-zero': patch
---

Scaffolded Dockerfiles use the current base images: `node:26-alpine` (Node 26 becomes the active LTS line on 2026-10-28) for the node adapter, and the latest `oven/bun:1` digest for the bun adapter. Both stay pinned by sha256 digest.
