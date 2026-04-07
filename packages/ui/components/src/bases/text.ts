import { Text } from '@pyreon/elements'
import { makeItResponsive, styles } from '@pyreon/unistyle'
import { rs } from './rs'

/**
 * Base text component — inline typography.
 *
 * Renders pseudo-state CSS via makeItResponsive.
 */
export const txt = rs({ name: 'TextBase', component: Text }).styles(
  (css) => css`
    ${({ $rocketstyle }) => {
      const {
        hover: hoverStyles,
        focus: focusStyles,
        active: activeStyles,
        disabled: disabledStyles,
        ...restStyles
      } = $rocketstyle

      const baseTheme = makeItResponsive({ theme: restStyles, styles, css })
      const hoverTheme = makeItResponsive({ theme: hoverStyles, styles, css })
      const focusTheme = makeItResponsive({ theme: focusStyles, styles, css })
      const activeTheme = makeItResponsive({ theme: activeStyles, styles, css })
      const disabledTheme = makeItResponsive({ theme: disabledStyles, styles, css })

      return css`
        ${baseTheme};
        &:hover {
          ${hoverTheme};
        }
        &:focus-visible {
          ${focusTheme};
        }
        &:active {
          ${activeTheme};
        }
        &:disabled,
        &[aria-disabled='true'] {
          ${disabledTheme};
        }
      `
    }}
  `,
)
