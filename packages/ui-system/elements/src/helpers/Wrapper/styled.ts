/**
 * Styled component for the Element wrapper layer. Handles responsive
 * block/inline-flex display, direction, alignment, and custom CSS injection.
 * Includes special handling for the `parentFix` / `childFix` flags that
 * split flex behavior across two DOM nodes for button/fieldset/legend
 * elements where a single flex container is insufficient.
 */
import { config } from '@pyreon/ui-core'
import { alignContent, extendCss, makeItResponsive, value } from '@pyreon/unistyle'
import type { ResponsiveStylesCallback } from '../../types'
import type { StyledProps, ThemeProps } from './types'

const { styled, css, component } = config

const childFixCSS = `
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
`

const parentFixCSS = `
  flex-direction: column;
`

export const styles: ResponsiveStylesCallback<ThemeProps> = ({ theme: t, css: cssFn, rootSize }) => cssFn`
  ${alignContent({
    direction: t.direction,
    alignX: t.alignX,
    alignY: t.alignY,
  })};

  /*
   * Always emit a value for the block-related properties so a responsive
   * theme that flips from \`block: true\` at one breakpoint to \`block: false\`
   * at another resets cleanly. Previously \`align-self\` / \`width\` / \`height\`
   * were only set when the truthy branch matched, which left the prior
   * breakpoint's values cascading through.
   */
  ${`align-self: ${t.block ? 'stretch' : 'auto'};
     width: ${t.block ? '100%' : 'auto'};
     height: ${t.alignY === 'block' ? '100%' : 'auto'};`};

  ${!t.childFix && `display: ${t.block ? 'flex' : 'inline-flex'};`};
  ${t.parentFix && parentFixCSS};

  /*
   * Element's typed \`gap\` completes here for SIMPLE elements (and the
   * needsFix childFix layer): modern CSS gap on the flex container. The
   * compound path keeps its slot-margin machinery (Content/styled.ts) and
   * never feeds gap into this bundle — see Element's WRAPPER_PROPS gate —
   * so the two mechanisms cannot double up.
   */
  ${t.gap != null && `gap: ${value(t.gap, rootSize)};`};

  ${t.extraStyles && extendCss(t.extraStyles as Parameters<typeof extendCss>[0])};
`

const platformCSS = `box-sizing: border-box;`

export default styled(component, { layer: 'elements' })`
  position: relative;
  ${platformCSS};

  ${(({ $childFix }: StyledProps) => $childFix && childFixCSS) as any};

  ${makeItResponsive({
    key: '$element',
    styles,
    css,
    normalize: true,
  })};
`
