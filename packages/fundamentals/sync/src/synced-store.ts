import type { CrdtDoc } from './crdt/types'
import { DEFAULT_MAP, type SyncedSignal, syncedSignal } from './synced-signal'

/**
 * A bag of {@link SyncedSignal}s — one per field, all backed by the same CRDT
 * map. `dispose` is a reserved field name (it tears down every field's
 * observer); a store key literally named `dispose` is not supported.
 */
export type SyncedStore<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: SyncedSignal<T[K]>
} & {
  /** Detach every field's CRDT observer. Idempotent. */
  dispose(): void
}

export interface SyncedStoreOptions {
  /** The CRDT document holding the fields. */
  doc: CrdtDoc
  /** Named map within the doc. Defaults to {@link DEFAULT_MAP}. One map = one store. */
  map?: string
}

/**
 * Build a flat store of synced fields from a plain initial object — the
 * ergonomic layer over {@link syncedSignal}. Each field becomes its own
 * `SyncedSignal` over a shared map, so `store.title()` reads reactively and
 * `store.title.set(v)` writes through the CRDT.
 *
 * A single-key change still produces exactly one base-signal write: every
 * field's observer runs, but only the field whose key changed calls `base.set`
 * (the rest early-return on a cheap `Set.has`). The "one op → one update"
 * invariant holds across the whole store.
 *
 * @example
 * const doc = new FakeCrdtAdapter().createDoc()
 * const store = syncedStore({ title: 'Untitled', done: false }, { doc })
 * store.title()        // 'Untitled'
 * store.title.set('Roadmap')
 * store.dispose()      // tear down when done (or rely on onCleanup in-scope)
 */
export function syncedStore<T extends Record<string, unknown>>(
  initial: T,
  options: SyncedStoreOptions,
): SyncedStore<T> {
  const mapName = options.map ?? DEFAULT_MAP
  const fields = {} as Record<string, SyncedSignal<unknown>>
  // Capture field keys separately — `dispose` is assigned onto `fields` below,
  // so iterating the object itself would try to dispose the method.
  const fieldKeys: string[] = []

  for (const key in initial) {
    if (!Object.hasOwn(initial, key)) continue
    if (key === 'dispose') {
      throw new Error(
        '[Pyreon] syncedStore: "dispose" is a reserved field name (it tears down the store). Rename the field.',
      )
    }
    fields[key] = syncedSignal({
      doc: options.doc,
      map: mapName,
      key,
      initial: initial[key],
    })
    fieldKeys.push(key)
  }

  const dispose = () => {
    for (const key of fieldKeys) fields[key]!.dispose()
  }

  return Object.assign(fields, { dispose }) as SyncedStore<T>
}
