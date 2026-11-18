import { extendCss } from '@pyreon/unistyle'

/**
 * The cascade layer a per-instance `css` prop renders into. `@pyreon/styler`
 * declares it LAST in the framework order (`@layer elements, rocketstyle,
 * instance;`), so a value passed at the call site beats both the primitive's
 * base layout (`elements`) and the component's own `.theme()` (`rocketstyle`)
 * for the same property (#4354). Unlayered author CSS still beats it.
 */
export const INSTANCE_LAYER = 'instance'

let warnedRawCss = false

/** Dev only, once per page: a raw CSS string reached `css` (the type no longer allows it). */
const warnRawCss = (text: string): void => {
  if (warnedRawCss) return
  warnedRawCss = true
  // oxlint-disable-next-line no-console
  console.warn(
    `[Pyreon] A raw CSS string was passed to the \`css\` prop ("${text.slice(0, 60)}"). ` +
      'Use the typed `styles` prop (`styles={{ gridTemplateColumns: { md: "repeat(3, 1fr)" } }}`), ' +
      'or write the escape hatch as a tagged template: css={css`…`} or css={(css) => css`…`}.',
  )
}

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
  if (process.env.NODE_ENV !== 'production' && typeof styles === 'string') warnRawCss(styles)
  const value = extendCss(styles as Parameters<typeof extendCss>[0])
  return value ? cssFn`@layer ${INSTANCE_LAYER}{${value}}` : ''
}
