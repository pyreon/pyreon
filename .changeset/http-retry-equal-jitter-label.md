---
'@pyreon/http': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Docs only: the `retry` middleware's default backoff is EQUAL jitter (a delay drawn uniformly from half to all of the exponential step), not "full jitter" as the comments, manifest and docs said. The algorithm is unchanged.
