---
'@pyreon/http': patch
---

A request with a timeout or a caller `signal` no longer registers and removes an `abort` event listener for each body read. The client watches its own abort link with a plain callback instead, since every abort of that signal goes through the client (the timer or the forwarded caller abort). This saves ~190 ns per read: the `GET with 5s timeout` benchmark row went from 1.72–1.94 µs to 1.57–1.58 µs, which ties ofetch where it was 1.1–1.2× ahead.
