import { defineStore } from '@pyreon/store'
import { signal, effect } from '@pyreon/reactivity'

/**
 * Global UI preferences — exercises `@pyreon/store` (composition mode).
 *
 * Stores: density (comfortable | compact), comment thread auto-expand,
 * and whether to show the breakpoint debug strip on the item page.
 * Persisted to localStorage at module load so prefs survive reload.
 *
 * Distinct from `state-tree` (used for bookmarks): `@pyreon/store` is
 * the canonical singleton global-state pattern; `state-tree` is for
 * structured, nested domain models with snapshots/patches. Different
 * tools for different shapes.
 */
export type Density = 'comfortable' | 'compact'

const STORAGE_KEY = 'hn-prefs'

interface PersistedPrefs {
  density: Density
  autoExpandComments: boolean
  showBreakpointDebug: boolean
}

function loadPersisted(): PersistedPrefs {
  if (typeof window === 'undefined') {
    return { density: 'comfortable', autoExpandComments: true, showBreakpointDebug: false }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        density: parsed.density === 'compact' ? 'compact' : 'comfortable',
        autoExpandComments: parsed.autoExpandComments !== false,
        showBreakpointDebug: parsed.showBreakpointDebug === true,
      }
    }
  } catch {
    /* corrupt entry — fall through to defaults */
  }
  return { density: 'comfortable', autoExpandComments: true, showBreakpointDebug: false }
}

export const usePrefs = defineStore('hn-prefs', () => {
  const initial = loadPersisted()
  const density = signal<Density>(initial.density)
  const autoExpandComments = signal(initial.autoExpandComments)
  const showBreakpointDebug = signal(initial.showBreakpointDebug)

  const setDensity = (d: Density) => density.set(d)
  const toggleAutoExpand = () => autoExpandComments.update((v) => !v)
  const toggleBreakpointDebug = () => showBreakpointDebug.update((v) => !v)

  // Persist on every change. The effect tracks all 3 signals; first run
  // does the initial write (idempotent — same value as just loaded).
  if (typeof window !== 'undefined') {
    effect(() => {
      const payload: PersistedPrefs = {
        density: density(),
        autoExpandComments: autoExpandComments(),
        showBreakpointDebug: showBreakpointDebug(),
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      } catch {
        /* quota / disabled — silent */
      }
    })
  }

  return {
    density,
    autoExpandComments,
    showBreakpointDebug,
    setDensity,
    toggleAutoExpand,
    toggleBreakpointDebug,
  }
})
