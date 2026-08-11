/**
 * The seam between the workbench and `@pyreon/store`.
 *
 * `addStorePlugin` registers a GLOBAL plugin that runs for every store created
 * afterwards, and each store's `subscribe` publishes its mutations. That is the
 * whole mechanism behind the Store panel — and it is worth isolating here for
 * two reasons:
 *
 *   1. `@pyreon/store` is an OPTIONAL dependency of the workbench. A project
 *      that does not use stores must not fail to load a panel over it, so the
 *      import is dynamic and its absence is a state the panel renders, not an
 *      error it throws.
 *   2. `addStorePlugin` has no `remove`. A plugin registered once stays
 *      registered for the life of the module, so "stop recording" has to be a
 *      flag the plugin reads rather than an unregistration — and that
 *      distinction belongs in one place, not in the panel.
 */
import type { StoreChange } from './store-timeline'

/** What `@pyreon/store` publishes per write. */
export interface StoreMutation {
  storeId: string
  type: 'direct' | 'patch'
  events: { key: string; newValue: unknown; oldValue: unknown }[]
}

export type Recorder = (mutation: StoreMutation, state: Record<string, unknown>) => void

/** Narrowed to what this file calls — the package is optional. */
interface StoreModule {
  addStorePlugin?: (
    plugin: (api: {
      id: string
      store: Record<string, unknown>
      subscribe?: (cb: Recorder) => () => void
    }) => void | (() => void),
  ) => void
}

let active: Recorder | undefined
let installed = false
let moduleAvailable: boolean | undefined

/**
 * Is there a store package to observe?
 *
 * Answered from the LAST load attempt rather than probed here: this is called
 * during render, and a dynamic import cannot be awaited there. Undefined —
 * nothing tried yet — reads as available so the panel offers Record; the
 * install itself reports the truth.
 */
export function isStoreAvailable(): boolean {
  return moduleAvailable !== false
}

/**
 * Start recording every store write.
 *
 * The plugin is registered at most ONCE per session, because `addStorePlugin`
 * has no counterpart to remove it. Subsequent Record presses swap the active
 * recorder, which is why stopping sets it to undefined rather than trying to
 * detach: a detached-looking plugin that is still attached would leak a
 * subscription per press.
 */
export function installStoreRecorder(recorder: Recorder): void {
  active = recorder
  if (installed) return
  installed = true
  void (async () => {
    try {
      const mod = (await import('@pyreon/store')) as StoreModule
      if (typeof mod.addStorePlugin !== 'function') {
        moduleAvailable = false
        return
      }
      moduleAvailable = true
      mod.addStorePlugin((api) => {
        if (typeof api.subscribe !== 'function') return
        return api.subscribe((mutation, state) => {
          // Read through `active` on every write, so Stop takes effect
          // immediately for stores that were already created.
          active?.(mutation, state)
        })
      })
    } catch {
      // No store package, or it failed to load. Not an error: most components
      // are not store-backed, and the panel says so.
      moduleAvailable = false
    }
  })()
}

/** Stop recording. The plugin stays registered — see `installStoreRecorder`. */
export function uninstallStoreRecorder(): void {
  active = undefined
}

/** Changes from a mutation, in the timeline's shape. */
export function changesOf(mutation: StoreMutation): StoreChange[] {
  return mutation.events.map((e) => ({
    key: e.key,
    oldValue: e.oldValue,
    newValue: e.newValue,
  }))
}

/**
 * Test seam — clears the active recorder ONLY.
 *
 * Deliberately does NOT reset `installed`. `addStorePlugin` has no counterpart
 * to remove a plugin, so a reset that allowed re-registration would attach a
 * SECOND plugin to the same stores and every write would be recorded twice.
 *
 * That is not hypothetical: the first version reset the flag, and the
 * real-store test measured a key written twice as having six writes — three
 * registrations × two writes. The seam has to model the constraint it is a
 * seam for, or the tests describe a bridge that does not exist.
 */
export function _resetStoreBridge(): void {
  active = undefined
}
