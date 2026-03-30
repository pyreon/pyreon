/**
 * Styled component for content areas (before/content/after). Applies
 * responsive flex alignment, gap spacing between slots based on parent
 * direction (margin-right for inline, margin-bottom for rows), and
 * equalCols flex distribution. The "content" slot gets `flex: 1` to
 * fill remaining space between before and after.
 */
import { config } from '@pyreon/ui-core'
import { alignContent, extendCss, makeItResponsive, value } from '@pyreon/unistyle'
import type { ResponsiveStylesCallback } from '../../types'
import type { StyledProps, ThemeProps } from './types'

const { styled, css, component } = config

const equalColsCSS = `
  flex: 1;
`

const typeContentCSS = `
  flex: 1;
`

// --------------------------------------------------------
// calculate spacing between before / content / after
// --------------------------------------------------------
const gapDimensions = {
  inline: {
    before: 'margin-right',
    after: 'margin-left',
  },
  reverseInline: {
    before: 'margin-right',
    after: 'margin-left',
  },
  rows: {
    before: 'margin-bottom',
    after: 'margin-top',
  },
  reverseRows: {
    before: 'margin-bottom',
    after: 'margin-top',
  },
} as const

const calculateGap = ({
  direction,
  type,
  value: gapValue,
}: {
  direction: keyof typeof gapDimensions
  type: ThemeProps['contentType']
  value: string | number | null | undefined
}) => {
  if (!direction || !type || type === 'content') return undefined

  const finalStyles = `${gapDimensions[direction][type]}: ${gapValue};`

  return finalStyles
}

// --------------------------------------------------------
// calculations of styles to be rendered
// --------------------------------------------------------
const styles: ResponsiveStylesCallback = ({ css: cssFn, theme: t, rootSize }) => cssFn`
  ${alignContent({
    direction: t.direction,
    alignX: t.alignX,
    alignY: t.alignY,
  })};

  ${t.equalCols && equalColsCSS};

  ${
    t.gap &&
    t.contentType &&
    calculateGap({
      direction: t.parentDirection,
      type: t.contentType,
      value: value(t.gap, rootSize),
    })
  };

  ${t.extraStyles && extendCss(t.extraStyles as Parameters<typeof extendCss>[0])};
`

const platformCSS = `box-sizing: border-box;`

const StyledComponent = styled(component)`
  ${platformCSS};

  display: flex;
  align-self: stretch;
  flex-wrap: wrap;

  ${(({ $contentType }: StyledProps) => $contentType === 'content' && typeContentCSS) as any};

  ${makeItResponsive({
    key: '$element',
    styles,
    css,
    normalize: true,
  })};
`

export default StyledComponent
