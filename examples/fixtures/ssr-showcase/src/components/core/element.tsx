/**
 * Core `element` wrapper — base of every visual component in the showcase.
 *
 * Wraps @pyreon/elements Element with rocketstyle, adding:
 * - Responsive base/hover/focus/active theme styles via makeItResponsive
 * - Pseudo-state via $rocketstate (hover, focus, pressed)
 * - Auto `cursor: pointer` when onClick/href is present
 *
 * This is the same pattern bokisch.com uses for its `core/element`.
 * Exercises the full CSS pipeline: processDescriptor → styles → makeItResponsive
 * → breakpoints → `@layer rocketstyle` wrapping.
 */

import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { makeItResponsive, styles } from '@pyreon/unistyle'

export default rocketstyle()({
  component: Element,
  name: 'core/Element',
}).styles(
  (css) => css`
    ${({ href, onClick, $rocketstyle, $rocketstate }: any) => {
      const isDynamic = onClick || href
      const { disabled, active, pseudo = {} } = $rocketstate
      const { hover, pressed, focus } = pseudo

      const {
        hover: hoverStyles = {},
        focus: focusStyles = {},
        active: activeStyles = {},
        ...restStyles
      } = $rocketstyle

      const baseTheme = makeItResponsive({ theme: restStyles, styles, css })
      const hoverTheme = makeItResponsive({ theme: hoverStyles, styles, css })
      const focusTheme = makeItResponsive({ theme: focusStyles, styles, css })
      const activeTheme = makeItResponsive({ theme: activeStyles, styles, css })

      return css`
        ${baseTheme};

        ${!disabled &&
        isDynamic &&
        css`
          cursor: pointer;
        `};

        ${!disabled &&
        !active &&
        isDynamic &&
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
        isDynamic &&
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
      `
    }};
  `,
)
