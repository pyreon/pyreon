import { Element } from '@pyreon/elements'
import { makeItResponsive, styles } from '@pyreon/unistyle'
import { rs } from './rs'

/**
 * Base element component — structured layout with alignment, beforeContent/afterContent.
 *
 * Handles CSS pseudo selectors (:hover, :focus-visible, :active, :disabled)
 * AND JS-driven pseudo state ($rocketstate.pseudo) via makeItResponsive.
 * Auto-adds cursor:pointer for interactive elements (onClick/href).
 */
export const el = rs({ name: 'Base', component: Element }).styles(
  (css) => css`
    ${({ href, onClick, $rocketstyle, $rocketstate }) => {
      const isDynamic = onClick || href
      const { disabled, active, pseudo = {} } = $rocketstate ?? {}
      const { hover, pressed, focus } = pseudo

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

        ${!disabled &&
        isDynamic &&
        css`
          cursor: pointer;
        `};

        ${!disabled &&
        css`
          &:hover {
            ${hoverTheme};
          }
        `};
        ${hover &&
        css`
          ${hoverTheme};
        `};

        ${!disabled &&
        css`
          &:focus-visible {
            ${focusTheme};
          }
        `};
        ${focus &&
        css`
          ${focusTheme};
        `};

        ${!disabled &&
        css`
          &:active {
            ${activeTheme};
          }
        `};
        ${!disabled &&
        (active || pressed) &&
        css`
          ${activeTheme};
        `};

        ${disabled &&
        css`
          ${disabledTheme};
        `};
        &:disabled,
        &[aria-disabled='true'] {
          ${disabledTheme};
        }
      `
    }}
  `,
)
