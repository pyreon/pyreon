---
'@pyreon/http': patch
---

Less per-request work: the body-kind check counts booleans instead of building and filtering an array on every request, and the path-placeholder RegExp is one shared instance instead of a new one per call.
