import type { VNodeChild } from "@pyreon/core";
import type { HTMLTags } from "@pyreon/ui-core";
import type {
  AlignX,
  AlignY,
  ContentAlignX,
  ContentAlignY,
  ContentBoolean,
  ContentDirection,
  Css,
  Direction,
  ExtendCss,
  ResponsiveBoolType,
} from "../../types";

export type Reference = unknown;

export interface Props {
  children: VNodeChild | VNodeChild[];
  tag: HTMLTags | undefined;
  block: ResponsiveBoolType | undefined;
  isInline: boolean | undefined;
  direction: Direction | undefined;
  alignX: AlignX | undefined;
  alignY: AlignY | undefined;
  equalCols: ResponsiveBoolType | undefined;
  extendCss: ExtendCss | undefined;
  dangerouslySetInnerHTML: { __html: string } | undefined;
}

export interface StyledProps {
  $element: {
    direction: Direction;
    alignX: AlignX;
    alignY: AlignY;
    equalCols: ResponsiveBoolType;
  } & Partial<{
    block: ResponsiveBoolType;
    extraStyles: ExtendCss;
    childFix: true;
    parentFix: true;
  }>;
  $childFix?: true;
}

export type ThemeProps = {
  direction: ContentDirection;
  alignX: ContentAlignX;
  alignY: ContentAlignY;
  equalCols: ContentBoolean;
} & Partial<{
  block: ContentBoolean;
  extraStyles: Css;
  childFix: true;
  parentFix: true;
}>;
