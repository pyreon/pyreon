import { provide, useContext } from "@pyreon/core"
import { PKG_NAME } from "../constants"
import { ContainerContext, RowContext } from "../context"
import type { ElementType } from "../types"
import useGridContext from "../useContext"
import { omitCtxKeys } from "../utils"
import Styled from "./styled"

/**
 * Row component that reads inherited config from ContainerContext, merges
 * it with its own props, and provides the resolved grid settings (columns,
 * gap, gutter) to Col children via RowContext. Renders a flex-wrap container
 * with negative margins to offset column gutters.
 */

const DEV_PROPS: Record<string, string> =
  process.env.NODE_ENV !== "production" ? { "data-coolgrid": "row" } : {}

const Component: ElementType<["containerWidth", "width", "rowComponent", "rowCss"]> = ({
  children,
  component,
  css,
  contentAlignX: rowAlignX,
  ...props
}) => {
  const parentCtx = useContext(ContainerContext)

  const {
    columns,
    gap,
    gutter,
    rowComponent,
    rowCss,
    contentAlignX,
    containerWidth,
    size,
    padding,
    colCss,
    colComponent,
  } = useGridContext({ ...parentCtx, ...props })

  const context = {
    containerWidth,
    size,
    padding,
    colCss,
    colComponent,
    columns,
    gap,
    gutter,
  }

  const finalProps = {
    $coolgrid: {
      contentAlignX: rowAlignX || contentAlignX,
      columns,
      gap,
      gutter,
      extraStyles: css || rowCss,
    },
  }

  // Provide row context to Col children
  provide(RowContext, context)

  return (
    <Styled {...omitCtxKeys(props)} as={component || rowComponent} {...finalProps} {...DEV_PROPS}>
      {children}
    </Styled>
  )
}

const name = `${PKG_NAME}/Row`

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
