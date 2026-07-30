/**
 * A rocketstyle base built DIRECTLY on the public ui-system packages — no
 * `@pyreon/atlas` import on purpose. `atlas dev` filters workbench
 * infrastructure by that import, so the demo-catalog chains never reach the
 * live workbench; this kit exists to prove the shape a real design system
 * ships: a rocketstyle chain in ordinary project files.
 *
 * The styles callback is the minimal pseudo-state glue every real base carries
 * (ui-components' `el`, the workbench's own base): it renders the theme's
 * `hover` block under `:hover` AND unconditionally when `$rocketstate.pseudo`
 * carries a FORCED `hover: true` — which is what the workbench's Pseudo-state
 * addon sets. Without this glue a forced pseudo state has nothing to render.
 */
import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { makeItResponsive, styles } from '@pyreon/unistyle'

export const rs = rocketstyle({ useBooleans: false })

export const chipBase = rs({ name: 'ChipBase', component: Element }).styles(
  (css) => css`
    ${({ $rocketstyle, $rocketstate }) => {
      const { pseudo = {} } = $rocketstate ?? {}
      const { hover: hoverStyles, ...restStyles } = $rocketstyle
      const baseTheme = makeItResponsive({ theme: restStyles, styles, css })
      const hoverTheme = makeItResponsive({ theme: hoverStyles, styles, css })
      return css`
        ${baseTheme};
        &:hover {
          ${hoverTheme};
        }
        ${pseudo.hover &&
        css`
          ${hoverTheme};
        `};
      `
    }}
  `,
)
