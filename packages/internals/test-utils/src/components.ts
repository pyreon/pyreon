/** Resolve a value that may be a function accessor or a plain object. */
const resolve = (value: any): any =>
  typeof value === 'function' ? value() : value

/**
 * Component that captures $rocketstyle for theme computation inspection.
 * Automatically resolves function accessors for both $rocketstyle and $rocketstate.
 */
export const ThemeCapture: any = ({
  $rocketstyle,
  $rocketstate,
  ...rest
}: any) => ({
  type: 'div',
  props: rest,
  children: [],
  key: null,
  $rocketstyle: resolve($rocketstyle),
  $rocketstate: resolve($rocketstate),
})
ThemeCapture.displayName = 'ThemeCapture'

/**
 * Base component that exposes pseudo-state via data attributes.
 * Automatically resolves function accessors.
 */
export const BaseComponent: any = ({
  children,
  $rocketstyle,
  $rocketstate,
  ...rest
}: any) => {
  const rs = resolve($rocketstate)
  return {
    type: 'div',
    props: {
      ...rest,
      'data-hover': String(rs?.pseudo?.hover ?? 'none'),
      'data-focus': String(rs?.pseudo?.focus ?? 'none'),
      'data-pressed': String(rs?.pseudo?.pressed ?? 'none'),
    },
    children,
    $rocketstyle: resolve($rocketstyle),
    $rocketstate: rs,
  }
}
BaseComponent.displayName = 'BaseComponent'
