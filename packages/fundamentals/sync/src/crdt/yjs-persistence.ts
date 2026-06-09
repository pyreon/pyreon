import { IndexeddbPersistence } from 'y-indexeddb'
import type { YjsCrdtDoc } from './yjs-adapter'

export interface YjsPersistence {
  /**
   * Resolves once the doc has loaded any state persisted in IndexedDB. Await
   * this BEFORE creating `syncedSignal`s, so create-if-missing sees the
   * persisted value rather than racing a fresh seed against the async load.
   */
  whenSynced: Promise<void>
  /** Stop persisting and close the IndexedDB connection. */
  destroy(): Promise<void>
}

/**
 * Persist a {@link YjsCrdtDoc} to IndexedDB so edits survive a reload (and the
 * app works offline). Thin wrapper over y-indexeddb's `IndexeddbPersistence`.
 *
 * Browser-only — it constructs the IndexedDB connection eagerly, so call it only
 * in the browser (importing this module under Node/SSR is safe; `y-indexeddb`
 * touches IndexedDB only on construction, not at import).
 *
 * @example
 * const doc = createYjsDoc()
 * const persist = persistViaIndexedDB(doc, 'my-app-doc')
 * await persist.whenSynced            // load persisted state first
 * const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
 */
export function persistViaIndexedDB(doc: YjsCrdtDoc, dbName: string): YjsPersistence {
  const provider = new IndexeddbPersistence(dbName, doc.yDoc)
  return {
    whenSynced: provider.whenSynced.then(() => undefined),
    destroy: () => provider.destroy(),
  }
}
