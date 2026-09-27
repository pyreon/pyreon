---
'@pyreon/zero': minor
---

`vercelAdapter()` defaults the SSR function to `nodejs22.x` (it was hardcoded to `nodejs20.x`, which reached end of life in April 2026) and accepts `vercelAdapter({ runtime })` to pin another version.

Upgrade: manual — the Vercel function now runs on nodejs22.x; pin the old runtime with `vercelAdapter({ runtime })` only if the app cannot move off Node 20.
