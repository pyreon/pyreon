import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/sync instances
// in the same heap. Name + version derived from this package's own
// package.json (single source of truth; the build inlines the literals).
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

// ─── CRDT seam (engine-neutral) ─────────────────────────────────────────────
export type { CrdtAdapter, CrdtDoc, CrdtMap, CrdtOrigin } from './crdt/types'
export { LOCAL_ORIGIN, REMOTE_ORIGIN } from './crdt/types'

// ─── In-memory adapter (tests / no-engine usage) ────────────────────────────
// The dependency-free adapter for unit-testing synced stores without standing
// up a real engine. The production engine — raw Yjs + IndexedDB persistence +
// cross-tab/WebSocket transport + collaborative text/lists — lives behind the
// `@pyreon/sync/yjs` subpath (keeping `yjs` out of this core entry); the relay
// server is at `@pyreon/sync/server`. See the README phase roadmap.
export {
  connectFakeDocs,
  FakeCrdtAdapter,
  FakeCrdtDoc,
  fakeAdapter,
} from './crdt/fake-adapter'

// ─── Reactive bridge (the moat — engine-independent) ────────────────────────
export {
  DEFAULT_MAP,
  type SyncedSignal,
  type SyncedSignalOptions,
  syncedSignal,
} from './synced-signal'
export { type SyncedStore, type SyncedStoreOptions, syncedStore } from './synced-store'
