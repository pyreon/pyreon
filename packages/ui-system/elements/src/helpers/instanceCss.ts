import { extendCss } from '@pyreon/unistyle'

/**
 * The cascade layer a per-instance `css` prop renders into. `@pyreon/styler`
 * declares it LAST in the framework order (`@layer elements, rocketstyle,
 * instance;`), so a value passed at the call site beats both the primitive's
 * base layout (`elements`) and the component's own `.theme()` (`rocketstyle`)
 * for the same property (#4354). Unlayered author CSS still beats it.
 */
export const INSTANCE_LAYER = 'instance'

/**
 * Render an instance `css` prop (`extraStyles`) inside `@layer instance { … }`.
 * The styler hoists that block out of the primitive's `@layer elements` rule
 * into the top-level `instance` layer, under the SAME class name, so no extra
 * class or cache entry exists per instance.
 *
 * Built with the styles callback's own `css` tag, not a string template: an
 * instance `css` may be a `CSSResult` with function interpolations, which must
 * resolve against the real props exactly as before.
 */
export const instanceCss = <R>(
  cssFn: (strings: TemplateStringsArray, ...values: unknown[]) => R,
  styles: unknown,
): R | '' => {
  const value = extendCss(styles as Parameters<typeof extendCss>[0])
  return value ? cssFn`@layer ${INSTANCE_LAYER}{${value}}` : ''
}
