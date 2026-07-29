---
'@pyreon/hooks': minor
---

`useWebSocket` had no web half — the third hook in this arc with that gap.

PMTC lowers `useWebSocket(url)` to `PyreonWebSocket` on BOTH native targets, and
the emitters synthesize an implicit auto-connect on mount, so the hook was fully
real on iOS and Android. On web it did not exist: no implementation, no export,
no type anywhere outside `packages/native/`.

That is the same failure `useGeolocation` and `useDatabase` had, for the same
reason — PMTC matches hook NAMES and never resolves imports, so
`import { useWebSocket } from '@pyreon/hooks'` compiles for two targets and is
unresolvable on the third. The compiler's own `lowered-hooks-typecheck` fixture
already writes exactly that import.

Found by a systematic sweep rather than by stumbling into it: every hook in
`NATIVE_LOWERED_HOOKS` was checked for a non-native implementation. `useAuth`,
`useMap`, `useSecureStorage`, `usePayments` and `usePush` remain without one and
are NOT fixed here.

The surface mirrors `PyreonWebSocket` member for member — `lastMessage`,
`messages`, `isConnected`, `error`, `connect`/`send`/`close` — because the point
is that one component body reads the same fields on three targets. Verified, not
assumed: the natural component compiles clean on both native targets with zero
warnings, and `{ws.lastMessage}` emits
`(ws.lastMessage).map { "\($0)" } ?? ""` rather than rendering
`Optional("hi")` — the trap that bit `useGeolocation`'s `Double?`.

`error` is a STRING, not an `Error`, to match what the native side can render
and what the compiler's `SERVICE_OPTIONAL_FIELDS` types it as. Keeping the web
type narrower than JS allows is what keeps one source valid everywhere.

Fields are GETTERS over signals. A component body runs once, so returning
resolved values would freeze every field at its mount value — the native
`@Observable` / `mutableStateOf` fields do not behave that way.

Three real bugs were written and then caught while building it, each locked by a
test: a synchronous `new WebSocket(bad)` throw left the lifecycle flag stuck
true so no later `connect()` could ever open (invalid URLs throw from the
constructor rather than firing `onerror`); a frame arriving between `close()`
and teardown could write into a disposed component's signals, so handlers are
dropped BEFORE closing; and `send` guards on `readyState`, since a frame sent
before `onopen` throws `InvalidStateError`.

HONEST LIMITS, matching the native half rather than exceeding it: TEXT frames
only (a binary frame is ignored, not stringified into data the native side
could never produce); no automatic reconnect or backoff; and `messages` grows
unbounded, exactly as `[String]` does natively.

The hooks manifest enumeration was also stale — it had been bumped to 48 for
`useGeolocation` without ever naming it, so the list no longer summed to its own
count. Both data hooks are now named.
