// `@pyreon/sync/yjs` — the Yjs engine adapter behind the engine-neutral seam.
// Kept out of the main `@pyreon/sync` entry so the core bridge stays engine-free
// (importing `@pyreon/sync` never pulls in `yjs`).
export {
  createYjsDoc,
  YjsAdapter,
  YjsCrdtDoc,
  yjsAdapter,
} from './crdt/yjs-adapter'
export { connectViaBroadcastChannel, connectYDocs } from './crdt/yjs-transport'
export { type YjsPersistence, persistViaIndexedDB } from './crdt/yjs-persistence'
export { type SyncedText, syncedText } from './crdt/yjs-text'
export { type SyncedList, syncedList } from './crdt/yjs-list'
