---
'@pyreon/query': patch
---

`useStream` now tracks the reads made in the first step of the iterable its source returns — which is where `openEventStream` / `openNdjsonStream` run `connect`. The documented shape reads its inputs there (`openEventStream((c) => ep({ params: { room: props.room }, … }))`), and on the web a change to `room` (or to a `json` body) used to leave the stream open on the old request, while the native lowering reopened it. A change now aborts the current request and opens a new one; the superseded stream's late events are still dropped by the generation guard. Reads after the first `await` (later events, reconnection attempts) are still not tracked, so a reconnect uses the current value without restarting the stream.
