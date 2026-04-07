import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

// Import ui-theme to activate the DefaultTheme type augmentation.
// This ensures all .theme() callbacks have typed `t` parameter.
import '@pyreon/ui-theme'

/** Shared rocketstyle factory — useBooleans enabled for all UI components. */
export const rs = rocketstyle({ useBooleans: true })

/** Base element component — all layout/interactive components extend this. */
export const el = rs({ name: 'Base', component: Element })

/** Base text component — all typography components extend this. */
export const txt = rs({ name: 'TextBase', component: Text })
