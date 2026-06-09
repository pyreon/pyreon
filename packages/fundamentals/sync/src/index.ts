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
// The only adapter that ships today. Real engine adapters (raw Yjs, a turnkey
// platform) + persistence + transport + relay land in follow-up PRs — see the
// README phase roadmap. This in-memory adapter is also how consumers unit-test
// their own synced stores without standing up an engine.
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
