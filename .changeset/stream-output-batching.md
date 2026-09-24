---
'@pyreon/runtime-server': minor
---

`renderToStream` batches output: fragments are accumulated and handed to the consumer at 4 KB, and at every point the render is about to wait (an async component or hole, end of the shell, each Suspense swap, close/error). The concatenated HTML is byte-identical; a 3.3 KB h()-built page goes out as a handful of chunks instead of ~300, and the shell still arrives before a slow boundary.
