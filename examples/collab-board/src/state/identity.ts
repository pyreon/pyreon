// Device-local identity + preferences. This is per-DEVICE state (theme, your
// display name + color), so @pyreon/storage owns it — NOT @pyreon/sync. The
// rule of thumb the showcase demonstrates: sync owns SHARED data; storage owns
// PER-DEVICE data. Never put the same value in both.
import { useColorScheme } from '@pyreon/hooks'
import { effect } from '@pyreon/reactivity'
import { type StorageSignal, useStorage } from '@pyreon/storage'

export type Theme = 'light' | 'dark'

// Module-level = app-global singletons (useStorage returns a reactive,
// cross-tab-synced, localStorage-backed signal). The theme defaults to the OS
// color scheme on first visit.
const osScheme = useColorScheme()
export const theme: StorageSignal<Theme> = useStorage<Theme>('collab.theme', osScheme())
export const displayName: StorageSignal<string> = useStorage('collab.name', 'Anonymous')
export const userColor: StorageSignal<string> = useStorage('collab.color', pickColor())

export function toggleTheme(): void {
  theme.set(theme() === 'dark' ? 'light' : 'dark')
}

/** Reflect the persisted theme onto `<html data-theme>` — reactive + cross-tab. */
export function applyStoredTheme(): void {
  effect(() => {
    document.documentElement.dataset.theme = theme()
  })
}

function pickColor(): string {
  const palette = ['#0c66e4', '#1f845a', '#b35900', '#5e4db2', '#c9372c', '#206a83']
  return palette[Math.floor(Math.random() * palette.length)] ?? palette[0]!
}
