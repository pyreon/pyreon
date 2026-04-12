import { values } from '../../units'
import { borderRadius, edge } from '../shorthands'
import processDescriptor from './processDescriptor'
import propertyMap from './propertyMap'
import type { ITheme, InnerTheme, Theme } from './types'

export type { ITheme, Theme as StylesTheme }

type Css = (strings: TemplateStringsArray, ...args: any[]) => any

export type Styles = ({
  theme,
  css,
  rootSize,
  globalTheme,
}: {
  theme: InnerTheme
  css: Css
  rootSize?: number | undefined
  globalTheme?: Record<string, any> | undefined
}) => ReturnType<Css>

/**
 * Data-driven style processor. Iterates the `propertyMap` descriptors
 * and delegates each to `processDescriptor`, which maps theme values
 * to CSS strings. The result is a single `css` tagged-template literal
 * containing all non-null property outputs.
 *
 * IMPORTANT: the return MUST be wrapped in `css\`...\`` — NOT a plain
 * string join. makeItResponsive embeds this result in another template
 * literal, and the CSS interpolation chain requires a css template
 * result (not a raw string) for correct nesting of media queries,
 * pseudo-selectors, and @layer wrapping. A previous version returned
 * `fragments.filter(Boolean).join(' ')` which broke responsive styles,
 * hover states, and layer cascade ordering.
 */
const styles: Styles = ({ theme: t, css, rootSize }) => {
  const calc = (...params: any[]) => values(params, rootSize)
  const shorthand = edge(rootSize)
  const borderRadiusFn = borderRadius(rootSize)

  const fragments = propertyMap.map((d) =>
    processDescriptor(d, t, css, calc, shorthand, borderRadiusFn),
  )

  return css`
    ${fragments}
  `
}

export default styles
