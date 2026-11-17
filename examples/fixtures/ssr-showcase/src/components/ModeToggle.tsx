/**
 * ModeToggle — toggles PyreonUI mode between light and dark.
 *
 * Used to test the reactivity fix from PR #210 (PyreonUI no longer
 * destructures props, so clicking this button updates mode reactively
 * for every consumer below). Also exercises the `mode` prop reactivity
 * when passed as a function form: `mode={() => modeSignal()}`.
 */

import { computed, signal } from '@pyreon/reactivity'

export type Mode = 'light' | 'dark'

// Module-level signal — shared across the app
export const modeSignal = signal<Mode>('light')
export const resolvedMode = computed(() => modeSignal())

export function toggleMode() {
  modeSignal.set(modeSignal() === 'light' ? 'dark' : 'light')
}

export function ModeToggle() {
  return (
    <button
      data-testid="mode-toggle"
      onClick={toggleMode}
      style="padding: 8px 16px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer; font-family: inherit;"
    >
      {() => `Mode: ${resolvedMode()}`}
    </button>
  )
}
