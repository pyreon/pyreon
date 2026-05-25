/**
 * Styled text primitive that inherits color, font-weight, and line-height
 * from its parent so it blends seamlessly into any context. Additional
 * styles can be injected via the responsive `extraStyles` prop processed
 * through makeItResponsive.
 */
import { config } from '@pyreon/ui-core'
import { extendCss, makeItResponsive } from '@pyreon/unistyle'
import type { Css, ResponsiveStylesCallback } from '../types'

const { styled, css, textComponent } = config

// Per-breakpoint resolved theme for Text — `Css` (callback / CSSResult /
// string) is what `extendCss` accepts. Text doesn't carry layout props,
// so the theme is just the optional `extraStyles` injection.
type ThemeProps = { extraStyles?: Css }

const styles: ResponsiveStylesCallback<ThemeProps> = ({ css: cssFn, theme: t }) => cssFn`
  ${t.extraStyles && extendCss(t.extraStyles as Parameters<typeof extendCss>[0])};
`

export default styled(textComponent, { layer: 'elements' })`
  ${css`
    color: inherit;
    font-weight: inherit;
    line-height: 1;
  `};

  ${makeItResponsive({
    key: '$text',
    styles,
    css,
    normalize: false,
  })};
`
