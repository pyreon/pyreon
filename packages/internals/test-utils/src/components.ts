/**
 * Component that captures $rocketstyle for theme computation inspection.
 * Returns a VNode-like object with $rocketstyle and $rocketstate attached.
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
  $rocketstyle,
  $rocketstate,
})
ThemeCapture.displayName = 'ThemeCapture'

/**
 * Base component that exposes pseudo-state via data attributes.
 * Useful for testing provider/consumer context flow.
 */
export const BaseComponent: any = ({
  children,
  $rocketstyle,
  $rocketstate,
  ...rest
}: any) => ({
  type: 'div',
  props: {
    ...rest,
    'data-hover': String($rocketstate?.pseudo?.hover ?? 'none'),
    'data-focus': String($rocketstate?.pseudo?.focus ?? 'none'),
    'data-pressed': String($rocketstate?.pseudo?.pressed ?? 'none'),
  },
  children,
  $rocketstyle,
  $rocketstate,
})
BaseComponent.displayName = 'BaseComponent'
