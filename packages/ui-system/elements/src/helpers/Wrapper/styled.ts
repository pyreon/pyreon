/**
 * Styled component for the Element wrapper layer. Handles responsive
 * block/inline-flex display, direction, alignment, and custom CSS injection.
 * Includes special handling for the `parentFix` / `childFix` flags that
 * split flex behavior across two DOM nodes for button/fieldset/legend
 * elements where a single flex container is insufficient.
 */
import { config } from "@pyreon/ui-core"
import { alignContent, extendCss, makeItResponsive } from "@pyreon/unistyle"
import type { ResponsiveStylesCallback } from "../../types"
import type { StyledProps } from "./types"

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

const fullHeightCSS = `
  height: 100%;
`

const blockCSS = `
  align-self: stretch;
  width: 100%;
`

const childFixPosition = (isBlock?: boolean) => `display: ${isBlock ? "flex" : "inline-flex"};`

const styles: ResponsiveStylesCallback = ({ theme: t, css: cssFn }) => cssFn`
  ${t.alignY === "block" && fullHeightCSS};

  ${alignContent({
    direction: t.direction,
    alignX: t.alignX,
    alignY: t.alignY,
  })};

  ${t.block && blockCSS};
  ${t.alignY === "block" && t.block && fullHeightCSS};

  ${!t.childFix && childFixPosition(t.block)};
  ${t.parentFix && parentFixCSS};

  ${t.extraStyles && extendCss(t.extraStyles as Parameters<typeof extendCss>[0])};
`

const platformCSS = `box-sizing: border-box;`

export default styled(component)`
  position: relative;
  ${platformCSS};

  ${(({ $childFix }: StyledProps) => $childFix && childFixCSS) as any};

  ${makeItResponsive({
    key: "$element",
    styles,
    css,
    normalize: true,
  })};
`
