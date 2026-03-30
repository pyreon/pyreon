import type { TestThemeOptions } from './context'
import { withThemeContext } from './context'

/**
 * Resolve $rocketstyle — handles both function accessor and plain object.
 */
export function resolveRocketstyle(value: unknown): unknown {
  return typeof value === 'function' ? (value as () => unknown)() : value
}

/**
 * Render a rocketstyle component within theme context and return the
 * resolved $rocketstyle theme object.
 *
 * @example
 * ```ts
 * const theme = getComputedTheme(Button, { state: 'primary' })
 * expect(theme.color).toBe('red')
 * ```
 */
export function getComputedTheme(
  Component: any,
  props?: Record<string, any>,
  contextOptions?: TestThemeOptions,
): any {
  return withThemeContext(() => {
    const vnode = Component(props ?? {}) as any
    return resolveRocketstyle(vnode.$rocketstyle)
  }, contextOptions)
}

/**
 * Render a component within theme context and return its VNode props.
 *
 * @example
 * ```ts
 * const props = renderProps(Button, { label: 'Click' })
 * expect(props.children).toBe('Click')
 * ```
 */
export function renderProps(
  Component: any,
  props?: Record<string, any>,
  contextOptions?: TestThemeOptions,
): any {
  return withThemeContext(() => {
    const vnode = Component(props ?? {})
    return vnode?.props ?? vnode
  }, contextOptions)
}
