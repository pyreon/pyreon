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
        placeholder: placeholderStyles,
        ...restStyles
      } = $rocketstyle

      const baseTheme = makeItResponsive({ theme: restStyles, styles, css })
      const hoverTheme = makeItResponsive({ theme: hoverStyles, styles, css })
      const focusTheme = makeItResponsive({ theme: focusStyles, styles, css })
      const activeTheme = makeItResponsive({ theme: activeStyles, styles, css })
      const disabledTheme = makeItResponsive({ theme: disabledStyles, styles, css })
      // A component's `placeholder: {...}` theme key styles `::placeholder`.
      // Without this branch the key reached unistyle as an unknown property and
      // was dropped, so every field showed the browser's default placeholder.
      const placeholderTheme = makeItResponsive({ theme: placeholderStyles as typeof hoverStyles, styles, css })
      // Native form controls do not inherit `font-family` — the browser gives
      // them its control font — so every button/input-based component rendered
      // off the page font (#4426). One rule, here in the base: only for those
      // tags (`:where()` adds no specificity), and only when the component's
      // theme sets no `fontFamily` of its own. Other `el` components emit
      // nothing, so a `font-serif` / `font-mono` utility on a Box applies as
      // before; on a control it behaves like any themed property.

      return css`
        ${baseTheme};

        ${!('fontFamily' in restStyles) &&
        css`
          &:where(button, input, select, textarea) {
            font-family: inherit;
          }
        `};

        ${placeholderStyles &&
        css`
          &::placeholder {
            ${placeholderTheme};
          }
        `};

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
