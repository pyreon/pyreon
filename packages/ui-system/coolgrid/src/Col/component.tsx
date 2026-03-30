import { useContext } from "@pyreon/core";
import { PKG_NAME } from "../constants";
import { RowContext } from "../context";
import type { ElementType } from "../types";
import useGridContext from "../useContext";
import { omitCtxKeys } from "../utils";
import Styled from "./styled";

/**
 * Col (column) component that reads grid settings from RowContext
 * (columns, gap, gutter) and calculates its own width as a fraction
 * of the total columns. Supports responsive size, padding, and visibility.
 */

const DEV_PROPS: Record<string, string> =
  process.env.NODE_ENV !== "production" ? { "data-coolgrid": "col" } : {};

const Component: ElementType<
  [
    "containerWidth",
    "width",
    "rowComponent",
    "rowCss",
    "colCss",
    "colComponent",
    "columns",
    "gap",
    "gutter",
    "contentAlignX",
  ]
> = ({ children, component, css, ...props }) => {
  const parentCtx = useContext(RowContext);
  const { colCss, colComponent, columns, gap, size, padding } = useGridContext({
    ...parentCtx,
    ...props,
  });

  const finalProps = {
    $coolgrid: {
      columns,
      gap,
      size,
      padding,
      extraStyles: css ?? colCss,
    },
  };

  return (
    <Styled {...omitCtxKeys(props)} as={component ?? colComponent} {...finalProps} {...DEV_PROPS}>
      {children}
    </Styled>
  );
};

const name = `${PKG_NAME}/Col`;

Component.displayName = name;
Component.pkgName = PKG_NAME;
Component.PYREON__COMPONENT = name;

export default Component;
