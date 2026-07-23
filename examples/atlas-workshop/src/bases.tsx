/**
 * Atlas workshop bases — replicating the ui-components architecture on the
 * PUBLIC ui-system (rocketstyle + elements + unistyle), with zero private deps.
 *
 *   el  — rocketstyle(Element) for layout + boxes
 *   txt — rocketstyle(Text) for typography
 *
 * Components are built as `el.attrs({ …layout }).theme((t) => ({ …css }))`; the
 * base `.styles()` renders the resolved `$rocketstyle` (incl. pseudo-state
 * blocks) via unistyle's `makeItResponsive`. Raw CSS goes through the `extendCss`
 * unistyle key so we can style freely against the reactive Atlas theme.
 */
import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { makeItResponsive, styles } from '@pyreon/unistyle'

/** Shared rocketstyle factory (string dimension props, e.g. state="active"). */
export const rs = rocketstyle({ useBooleans: false })

/** Base element — layout box with :hover / :focus-visible / :active / :disabled. */
export const el = rs({ name: 'AtlasEl', component: Element }).styles(
  (css) => css`
    ${({ href, onClick, $rocketstyle, $rocketstate }) => {
      const isDynamic = onClick || href
      const { disabled, active, pseudo = {} } = $rocketstate ?? {}
      const { hover, focus } = pseudo

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
        ${!disabled && isDynamic &&
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
        ${!disabled && active &&
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

/** Base text — inline typography. */
export const txt = rs({ name: 'AtlasTxt', component: Text }).styles(
  (css) => css`
    ${({ $rocketstyle }) => {
      const { hover: hoverStyles, disabled: disabledStyles, ...restStyles } = $rocketstyle
      const baseTheme = makeItResponsive({ theme: restStyles, styles, css })
      const hoverTheme = makeItResponsive({ theme: hoverStyles, styles, css })
      const disabledTheme = makeItResponsive({ theme: disabledStyles, styles, css })
      return css`
        ${baseTheme};
        &:hover {
          ${hoverTheme};
        }
        &:disabled,
        &[aria-disabled='true'] {
          ${disabledTheme};
        }
      `
    }}
  `,
)
