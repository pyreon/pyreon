/**
 * Styled text primitive that inherits color, font-weight, and line-height
 * from its parent so it blends seamlessly into any context. Additional
 * styles can be injected via the responsive `extraStyles` prop processed
 * through makeItResponsive.
 */
import { config } from '@pyreon/ui-core'
import { makeItResponsive } from '@pyreon/unistyle'
import { instanceCss } from '../helpers/instanceCss'
import { instanceStylesInterpolation, withoutInstanceStyles } from '../helpers/instanceStyles'
import type { Css, ResponsiveStylesCallback } from '../types'

const { styled, css, textComponent } = config

// Per-breakpoint resolved theme for Text — `Css` (callback / CSSResult /
// string) is what `extendCss` accepts. Text doesn't carry layout props,
// so the theme is just the optional `extraStyles` injection.
type ThemeProps = { extraStyles?: Css }

const styles: ResponsiveStylesCallback<ThemeProps> = ({ css: cssFn, theme: t }) => cssFn`
  ${t.extraStyles && instanceCss(cssFn, t.extraStyles)};
`

export default styled(textComponent, { layer: 'elements' })`
  ${css`
    color: inherit;
    font-weight: inherit;
    line-height: 1;
  `};

  ${withoutInstanceStyles(
    '$text',
    makeItResponsive({
      key: '$text',
      styles,
      css,
      normalize: false,
    }),
  )};

  ${instanceStylesInterpolation(css, '$text')};
`
