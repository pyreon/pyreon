import rocketstyle from '@pyreon/rocketstyle'

// Activate ThemeDefault type augmentation for typed .theme() callbacks.
import '@pyreon/ui-theme'

/**
 * Shared rocketstyle factory for all UI components.
 *
 * The default dimension map, with one change: `variants` is a TRANSFORM
 * dimension. A variant value may be a function of the theme accumulated from
 * the base `.theme()` and the active state and size, so a variant can draw in
 * the state's tone (`toneVariant` in `fragments.ts`) instead of hard-coding
 * one. Plain-object variant values merge exactly as before.
 */
export const rs = rocketstyle({
  useBooleans: false,
  dimensions: {
    states: 'state',
    sizes: 'size',
    variants: { propName: 'variant', transform: true },
    multiple: { propName: 'multiple', multi: true },
    modifiers: { propName: 'modifier', multi: true, transform: true },
  },
})
