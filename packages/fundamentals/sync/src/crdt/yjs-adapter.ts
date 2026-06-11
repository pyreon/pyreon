import * as Y from 'yjs'
import { destroyDocAwareness } from './yjs-awareness'
import {
  type CrdtAdapter,
  type CrdtDoc,
  type CrdtMap,
  type CrdtOrigin,
  LOCAL_ORIGIN,
} from './types'

/**
 * Yjs implementation of the {@link CrdtAdapter} seam. The reactive bridge
 * (`syncedSignal` / `syncedStore`) runs over this UNCHANGED — the seam was
 * shaped to match Yjs's own model exactly: `doc.transact(fn, origin)` carries an
 * origin, and `Y.Map.observe((event, txn) => …)` reports `event.keysChanged`
 * (the changed-key Set) + `txn.origin` at the end of each transaction, local and
 * remote alike.
 *
 * Only this module (and `yjs-transport.ts`) import `yjs`; it ships behind the
 * `@pyreon/sync/yjs` subpath so the core bridge stays engine-free.
 *
 * v1 binds scalar map values. Yjs stores plain objects/arrays as-is (not as
 * nested Y types), so a whole-value replace works but is coarse — granular
 * collections (`Y.Array` / `Y.Text`) are a later phase.
 */

class YjsCrdtMap implements CrdtMap {
  constructor(private readonly ymap: Y.Map<unknown>) {}

  get(key: string): unknown {
    return this.ymap.get(key)
  }

  set(key: string, value: unknown): void {
    this.ymap.set(key, value)
  }

  has(key: string): boolean {
    return this.ymap.has(key)
  }

  keys(): string[] {
    return [...this.ymap.keys()]
  }

  observe(
    cb: (changedKeys: ReadonlySet<string>, origin: CrdtOrigin) => void,
  ): () => void {
    const handler = (event: Y.YMapEvent<unknown>, txn: Y.Transaction) => {
      cb(event.keysChanged, txn.origin)
    }
    this.ymap.observe(handler)
    return () => this.ymap.unobserve(handler)
  }
}

/**
 * A {@link CrdtDoc} backed by a Yjs document. Exposes the underlying `yDoc` so
 * the transport / persistence layers can wire the update stream — the bridge
 * itself only ever uses the {@link CrdtDoc} interface.
 */
export class YjsCrdtDoc implements CrdtDoc {
  /** The underlying Yjs document — for transport (`yDoc.on('update', …)`) / persistence. */
  readonly yDoc: Y.Doc
  private readonly maps = new Map<string, YjsCrdtMap>()

  constructor(yDoc?: Y.Doc) {
    this.yDoc = yDoc ?? new Y.Doc()
  }

  getMap(name: string): CrdtMap {
    let m = this.maps.get(name)
    if (!m) {
      m = new YjsCrdtMap(this.yDoc.getMap(name))
      this.maps.set(name, m)
    }
    return m
  }

  transact(fn: () => void, origin: CrdtOrigin = LOCAL_ORIGIN): void {
    this.yDoc.transact(fn, origin)
  }

  destroy(): void {
    // The doc OWNS its awareness lifecycle (a `syncedAwareness` view's dispose
    // only detaches its own listener) — tear it down here before the Y.Doc.
    destroyDocAwareness(this)
    this.yDoc.destroy()
  }
}

/** The Yjs engine factory. */
export class YjsAdapter implements CrdtAdapter {
  createDoc(): CrdtDoc {
    return new YjsCrdtDoc()
  }
}

/** Shared Yjs adapter instance. */
export const yjsAdapter: CrdtAdapter = new YjsAdapter()

/** Wrap an existing `Y.Doc` (or create a fresh one) as a {@link YjsCrdtDoc}. */
export function createYjsDoc(yDoc?: Y.Doc): YjsCrdtDoc {
  return new YjsCrdtDoc(yDoc)
}
