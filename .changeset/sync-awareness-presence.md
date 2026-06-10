---
"@pyreon/sync": minor
---

Add `syncedAwareness` — ephemeral presence + live cursors over the Yjs awareness protocol (exported from `@pyreon/sync/yjs`). It is a separate, never-persisted channel from the document CRDT: reactive `local` / `others` / `states` signals plus `setLocal` / `setLocalField` to publish your own presence (`PeerState<T> = { clientId, state, isLocal }`).

Awareness rides both transports (`connectViaWebSocket` + `connectViaBroadcastChannel`) on a new `MSG_AWARENESS` frame, applied under the shared `REMOTE_ORIGIN` so a received presence is never re-broadcast by a sibling transport (cross-transport loop guard). The relay (`createSyncServer`) is now awareness-stateful: a joining client sees existing peers instantly, and a crashed client's presence is purged on socket close. Create `syncedAwareness` before connecting a transport; apps that never use presence pay zero awareness overhead.
