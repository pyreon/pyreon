import { config } from '@pyreon/ui-core'
import type { MakeItResponsiveStyles } from '@pyreon/unistyle'
import { extendCss, makeItResponsive, value } from '@pyreon/unistyle'
import type { StyledTypes } from '../types'

const { styled, css, component } = config

/** Responsive styles that apply the container's max-width and any extra CSS at each breakpoint. */
const styles: MakeItResponsiveStyles<Pick<StyledTypes, 'width' | 'extraStyles'>> = ({
  theme: t,
  css: cssFn,
  rootSize,
}) => {
  const w = t.width != null && typeof t.width !== 'object' ? t.width : null

  return cssFn`
    ${w != null ? `max-width: ${value(w, rootSize)};` : ''};
    ${extendCss(t.extraStyles)};
  `
}

/** Styled Container element. Centered via auto margins with responsive max-width. */
export default styled(component)`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  margin-right: auto;
  margin-left: auto;

  ${makeItResponsive({
    key: '$coolgrid',
    styles,
    css,
    normalize: true,
  })};
`
