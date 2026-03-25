/**
 * Content area used inside Element to render one of the three
 * layout slots (before, content, after). Passes alignment, direction,
 * gap, and equalCols styling props to the underlying styled component.
 * Adds a `data-pyr-element` attribute in development for debugging.
 *
 * Children are rendered via core `render()`.
 */
import { render } from "@pyreon/ui-core"
import { IS_DEVELOPMENT } from "../../utils"
import Styled from "./styled"
import type { Props } from "./types"

const Component = ({
  contentType,
  tag,
  parentDirection,
  direction,
  alignX,
  alignY,
  equalCols,
  gap,
  extendCss,
  children,
  ...props
}: Partial<Props>) => {
  const debugProps = IS_DEVELOPMENT
    ? {
        "data-pyr-element": contentType,
      }
    : {}

  const stylingProps = {
    contentType,
    parentDirection,
    direction,
    alignX,
    alignY,
    equalCols,
    gap,
    extraStyles: extendCss,
  }

  return (
    <Styled as={tag} $contentType={contentType} $element={stylingProps} {...debugProps} {...props}>
      {render(children)}
    </Styled>
  )
}

export default Component
