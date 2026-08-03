---
'@pyreon/native-runtime-swift': patch
---

`PyreonWebSocket.isConnected` now flips on the real handshake, not on `resume()`.

`connect(to:)` called `opened()` immediately after `task.resume()`, which only means the connection was *requested*. A socket pointed at a dead or unreachable server therefore read as connected, and any UI gating on `isConnected` showed a live connection that never existed. Kotlin has always flipped on OkHttp's real `onOpen`; this brings Swift to the same contract rather than documenting the difference.

The flag is now driven by a `URLSessionWebSocketDelegate` (`didOpenWithProtocol` / `didCloseWith`). The delegate is a separate object because `URLSession` retains its delegate — making the `@Observable` container itself the delegate would create a cycle it could not break — and it is released alongside the session in `close()`.

A pre-existing lifecycle test asserted the old behaviour with the comment *"opened() fired optimistically on resume"*, so it could never have caught this. Its real invariant (the connect/close lifecycle and its idempotency) is unchanged; only that one assertion moves to the corrected truth.
