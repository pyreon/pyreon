import rocketstyle from '@pyreon/rocketstyle'

// Activate ThemeDefault type augmentation for typed .theme() callbacks.
import '@pyreon/ui-theme'

/** Shared rocketstyle factory for all UI components. */
export const rs = rocketstyle({ useBooleans: false })
