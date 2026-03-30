import { config } from '@pyreon/ui-core'
import type { MakeItResponsiveStyles } from '@pyreon/unistyle'
import { extendCss, makeItResponsive, value } from '@pyreon/unistyle'
import type { CssOutput, StyledTypes } from '../types'
import { hasValue, isNumber, isVisible } from '../utils'

const { styled, css, component } = config

type HasWidth = (size?: number, columns?: number) => boolean

/** Returns true when both size and columns are valid, enabling explicit width calculation. */
const hasWidth: HasWidth = (size, columns) => hasValue(size) && hasValue(columns)

type WidthStyles = (
  props: Pick<StyledTypes, 'size' | 'columns' | 'gap'>,
  defaults: { rootSize?: number | undefined },
) => CssOutput

/**
 * Calculates column width as a percentage of total columns, subtracting
 * the gap when present. Uses `calc(%)` for web.
 */
const widthStyles: WidthStyles = ({ size, columns, gap }, { rootSize }) => {
  if (!hasWidth(size, columns)) {
    return ''
  }

  const s = size as number
  const c = columns as number
  const g = gap as number

  // calculate % of width
  const width = (s / c) * 100

  const hasGap = hasValue(gap)

  const val = hasGap ? `calc(${width}% - ${g}px)` : `${width}%`

  const v = value(val, rootSize)

  return css`
    flex-grow: 0;
    flex-shrink: 0;
    max-width: ${v};
    flex-basis: ${v};
  `
}

type SpacingStyles = (type: 'margin' | 'padding', param?: number, rootSize?: number) => CssOutput
/** Applies half of the given value as either margin or padding (used for gap and padding distribution). */
const spacingStyles: SpacingStyles = (type, param, rootSize) => {
  if (!isNumber(param)) {
    return ''
  }

  const finalStyle = `${type}: ${value((param as number) / 2, rootSize)}`

  return css`
    ${finalStyle};
  `
}

/**
 * Main responsive style block for Col. When the column is visible, applies
 * width, padding, margin, and extra CSS. When hidden (size === 0), moves
 * the element off-screen with fixed positioning.
 */
const styles: MakeItResponsiveStyles<StyledTypes> = ({ theme, css: cssFn, rootSize }) => {
  const { size, columns, gap, padding, extraStyles } = theme
  const renderStyles = isVisible(size)

  if (renderStyles) {
    return cssFn`
      left: initial;
      position: relative;
      ${widthStyles({ size, columns, gap }, { rootSize })};
      ${spacingStyles('padding', padding, rootSize)};
      ${spacingStyles('margin', gap, rootSize)};
      ${extendCss(extraStyles)};
    `
  }

  return cssFn`
    left: -9999px;
    position: fixed;
    margin: 0;
    padding: 0;
  `
}

export default styled(component)`
  box-sizing: border-box;
  justify-content: stretch;

  position: relative;
  display: flex;
  flex-basis: 0;
  flex-grow: 1;
  flex-direction: column;

  ${makeItResponsive({
    key: '$coolgrid',
    styles,
    css,
    normalize: true,
  })};
`
