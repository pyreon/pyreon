/**
 * Styled text primitive that inherits color, font-weight, and line-height
 * from its parent so it blends seamlessly into any context. Additional
 * styles can be injected via the responsive `extraStyles` prop processed
 * through makeItResponsive.
 */
import { config } from '@pyreon/ui-core'
import { extendCss, makeItResponsive } from '@pyreon/unistyle'
import type { ResponsiveStylesCallback } from '../types'

const { styled, css, textComponent } = config

const styles: ResponsiveStylesCallback = ({ css: cssFn, theme: t }) => cssFn`
  ${t.extraStyles && extendCss(t.extraStyles)};
`

export default styled(textComponent)`
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
