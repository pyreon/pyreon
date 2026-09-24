---
'@pyreon/zero': minor
---

`vercelAdapter()` defaults the SSR function to `nodejs22.x` (it was hardcoded to `nodejs20.x`, which reached end of life in April 2026) and accepts `vercelAdapter({ runtime })` to pin another version.
