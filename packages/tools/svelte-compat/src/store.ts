/**
 * `@pyreon/svelte-compat/store` — the `svelte/store` import surface.
 *
 * Svelte code does `import { writable } from 'svelte/store'`; the vite
 * plugin's `compat: 'svelte'` aliases that specifier to this entry.
 * Re-exports only the store API (not lifecycle/context) so the subpath
 * mirrors Svelte's real `svelte/store` shape; the everything-entry is
 * `@pyreon/svelte-compat` (`./index`).
 */

export { derived, get, readable, readonly, writable } from './index'
export type {
  Invalidator,
  Readable,
  StartStopNotifier,
  Subscriber,
  Unsubscriber,
  Updater,
  Writable,
} from './index'
