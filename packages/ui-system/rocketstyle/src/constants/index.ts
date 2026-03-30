/** Default theme mode used when no mode is provided via context. */
export const MODE_DEFAULT = 'light'

/** Pseudo-state interaction keys tracked for styling (hover, active, focus, pressed). */
export const PSEUDO_KEYS = ['hover', 'active', 'focus', 'pressed'] as const

/** Meta pseudo-state keys representing non-interactive states (disabled, readOnly). */
export const PSEUDO_META_KEYS = ['disabled', 'readOnly'] as const

/** Supported theme mode flags. */
export const THEME_MODES = {
  light: true,
  dark: true,
} as const

/** Maps each theme mode to its inverse (light -> dark, dark -> light). */
export const THEME_MODES_INVERSED = {
  dark: 'light',
  light: 'dark',
} as const

/** Reserved configuration keys accepted by the `.config()` chaining method. */
export const CONFIG_KEYS = [
  'provider',
  'consumer',
  'DEBUG',
  'name',
  'component',
  'inversed',
  'passProps',
  'styled',
] as const

/** Keys for theme and styles chaining methods. */
export const STYLING_KEYS = ['theme', 'styles'] as const
export const STATIC_KEYS = [...STYLING_KEYS, 'compose'] as const

/** Union of all reserved keys that cannot be used as dimension names. */
export const ALL_RESERVED_KEYS = [
  ...Object.keys(THEME_MODES),
  ...CONFIG_KEYS,
  ...STATIC_KEYS,
  'attrs',
] as const
