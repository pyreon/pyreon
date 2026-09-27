---
'@pyreon/zero': patch
---

fix(zero): match API routes most-specific first

API routes were registered in directory-read order and the dispatcher uses the first match, so `api/[...path].ts` shadowed every other API route and `api/posts/[id].ts` handled `/api/posts/new`. Routes are now ordered by specificity, segment by segment from the left: a static segment wins over a dynamic one, which wins over a catch-all. The order no longer depends on the filesystem.
