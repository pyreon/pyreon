import { List } from '@pyreon/elements'
import type { MaybeNull, ObjectValue, SimpleValue } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { makeItResponsive, styles, value } from '@pyreon/unistyle'

// Re-export Iterator types needed for list type inference
export type { MaybeNull, ObjectValue, SimpleValue }

type ListStyles = Parameters<typeof makeItResponsive>[0]['styles']

const listStyles: ListStyles = ({ theme: t, css, rootSize }) => css`
  ${t.gap && `margin: ${value(t.gap / 2, rootSize)} !important;`};
  ${t.indent && `padding: ${value(t.indent / 2, rootSize)} !important;`};
`

/**
 * Base list component — data-driven list with gap/indent dimensions.
 *
 * Uses custom rocketstyle dimensions: indent, gaps, gapsY.
 * Renders children with responsive gap/indent via makeItResponsive.
 */
export const list = rocketstyle({
  dimensions: { indent: 'indent', gaps: 'gap', gapsY: 'gapY' },
  useBooleans: false,
})({ name: 'ListBase', component: List })
  .attrs({ rootElement: true, contentDirection: 'rows' })
  .theme((t) => ({
    boxSizing: 'border-box',
    margin: t.spacing.reset,
    padding: t.spacing.reset,
    listStyleType: 'none',
  }))
  .indent((t) => ({
    small: { padding: t.spacing.xSmall / 2 },
    medium: { padding: t.spacing.medium / 2 },
    large: { padding: t.spacing.large / 2 },
    xLarge: { padding: t.spacing.xLarge / 2 },
    xxLarge: { padding: t.spacing.xxLarge / 2 },
  }))
  .gaps((t) => ({
    small: { margin: (t.spacing.xSmall * -1) / 2, gap: t.spacing.xSmall },
    medium: { margin: (t.spacing.medium * -1) / 2, gap: t.spacing.medium },
    large: { margin: (t.spacing.large * -1) / 2, gap: t.spacing.large },
    xLarge: { margin: (t.spacing.xLarge * -1) / 2, gap: t.spacing.xLarge },
    xxLarge: { margin: (t.spacing.xxLarge * -1) / 2, gap: t.spacing.xxLarge },
  }))
  .gapsY((t) => ({
    xSmall: { margin: t.spacing.xSmall },
    small: { margin: t.spacing.small },
    medium: { margin: t.spacing.medium },
    large: { margin: t.spacing.large },
    xLarge: { margin: t.spacing.xLarge },
    xxLarge: { margin: t.spacing.xxLarge },
  }))
  .styles(
    (css) => css`
      ${({ $rocketstyle, rootElement }) => {
        const { gap, indent, ...restStyles } = $rocketstyle

        const baseTheme = makeItResponsive({ theme: restStyles, styles, css })
        const listTheme = makeItResponsive({ theme: { gap, indent }, styles: listStyles, css })

        return css`
          flex-wrap: wrap;
          ${baseTheme};
          ${rootElement &&
          css`
            & > * {
              ${listTheme};
            }
          `};
        `
      }}
    `,
  )
