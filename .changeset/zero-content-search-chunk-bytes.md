---
'@pyreon/zero-content': patch
---

`content()` takes `searchChunkWarnBytes` (default 300 KiB) and `searchChunkErrorBytes` (default 1 MiB): the size at which one collection's search index warns and fails the build. The bounds existed in the index builder but no plugin option reached them, so a large site could not raise the 1 MiB failure. The messages now name the option to raise.
