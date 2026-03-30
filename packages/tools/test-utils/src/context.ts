import { popContext, pushContext } from '@pyreon/core'
import { context } from '@pyreon/rocketstyle'

export interface TestThemeOptions {
  theme?: Record<string, unknown>
  mode?: 'light' | 'dark'
  isDark?: boolean
  isLight?: boolean
}

const DEFAULTS: Required<TestThemeOptions> = {
  theme: { rootSize: 16 },
  mode: 'light',
  isDark: false,
  isLight: true,
}

/**
 * Build a context Map suitable for pushContext() with theme/mode values.
 */
export function buildThemeContextMap(
  options?: TestThemeOptions,
): Map<symbol, unknown> {
  const value = { ...DEFAULTS, ...options }
  return new Map([[context.id, value]])
}

/**
 * Execute `fn` within a theme context. Pushes before, pops after.
 *
 * @example
 * ```ts
 * const result = withThemeContext(() => Button({ state: 'primary' }))
 * expect(result).toBeDefined()
 * ```
 */
export function withThemeContext<T>(
  fn: () => T,
  options?: TestThemeOptions,
): T {
  pushContext(buildThemeContextMap(options))
  try {
    return fn()
  } finally {
    popContext()
  }
}
