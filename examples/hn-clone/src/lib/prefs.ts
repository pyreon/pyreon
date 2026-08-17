import { defineStore } from '@pyreon/store'
import { useStorage } from '@pyreon/storage'

/**
 * Global UI preferences — `@pyreon/store` composed with `@pyreon/storage`.
 *
 * `@pyreon/store` ships no persist middleware on purpose: the intended answer
 * is composition. A `StorageSignal` IS a signal, so it classifies as state and
 * `patch` / `reset` / `subscribe` / `dehydrateStores` all flow through it —
 * with cross-tab sync for free.
 *
 * This file used to hand-roll that: a `loadPersisted()` with try/catch, JSON
 * parsing, per-field coercion, a defaults object repeated twice, and a
 * write-back effect. 81 lines doing what three `useStorage` calls do, and
 * doing it worse — the hand-rolled version had no cross-tab sync.
 *
 * NOTE: prefs are now three keys rather than one JSON blob under `hn-prefs`,
 * so a visitor with saved prefs gets defaults once. Acceptable for a demo; a
 * real app would read the old key once and seed.
 */
export type Density = 'comfortable' | 'compact'

export const usePrefs = defineStore('hn-prefs', () => {
  const density = useStorage<Density>('hn-prefs-density', 'comfortable')
  const autoExpandComments = useStorage('hn-prefs-expand', true)
  const showBreakpointDebug = useStorage('hn-prefs-debug', false)

  return {
    density,
    autoExpandComments,
    showBreakpointDebug,
    setDensity: (d: Density) => density.set(d),
    toggleAutoExpand: () => autoExpandComments.update((v) => !v),
    toggleBreakpointDebug: () => showBreakpointDebug.update((v) => !v),
  }
})
