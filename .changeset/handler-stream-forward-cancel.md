---
'@pyreon/server': patch
---

A client disconnect now stops a streaming render. The streaming handler's response body did not forward `cancel` to the inner render, so it kept running until every Suspense boundary settled or timed out (forever with `suspenseTimeoutMs: Infinity`), and its next write into the cancelled body was logged and reported to `onError` as a render failure. Cancelling the response now cancels the render, and a disconnect is never reported as an error.
