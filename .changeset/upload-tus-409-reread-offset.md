---
'@pyreon/upload': patch
---

`tusTransport`: a `PATCH` answered 409 (offset conflict) no longer fails the upload. The transport asks the server its offset again with `HEAD` and continues from there, up to three conflicts in a row; past that it fails with a `[Pyreon]` error (not retryable), and if the server no longer has the upload after a conflict it fails retryably, so the queue's retry starts a new one.
