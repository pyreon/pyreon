/**
 * Core building block of the elements package. Renders a three-section layout
 * (beforeContent / content / afterContent) inside a flex Wrapper. When only
 * content is present, the Wrapper inherits content-level alignment directly
 * to avoid an unnecessary nesting layer. Handles HTML-specific edge cases
 * like void elements (input, img) and inline elements (span, a) by
 * skipping children or switching sub-tags accordingly.
 */

import { onMount } from "@pyreon/core";
import { render } from "@pyreon/ui-core";
import { PKG_NAME } from "../constants";
import { Content, Wrapper } from "../helpers";
import type { PyreonElement } from "./types";
import { getShouldBeEmpty, isInlineElement } from "./utils";

const equalize = (el: HTMLElement, direction: unknown) => {
  const beforeEl = el.firstElementChild as HTMLElement | null;
  const afterEl = el.lastElementChild as HTMLElement | null;

  if (beforeEl && afterEl && beforeEl !== afterEl) {
    const type: "height" | "width" = direction === "rows" ? "height" : "width";
    const prop = type === "height" ? "offsetHeight" : "offsetWidth";
    const beforeSize = beforeEl[prop];
    const afterSize = afterEl[prop];

    if (Number.isInteger(beforeSize) && Number.isInteger(afterSize)) {
      const maxSize = `${Math.max(beforeSize, afterSize)}px`;
      beforeEl.style[type] = maxSize;
      afterEl.style[type] = maxSize;
    }
  }
};

const defaultDirection = "inline";
const defaultContentDirection = "rows";
const defaultAlignX = "left";
const defaultAlignY = "center";

const Component: PyreonElement = ({
  innerRef,
  tag,
  label,
  content,
  children,
  beforeContent,
  afterContent,
  equalBeforeAfter,

  block,
  equalCols,
  gap,

  direction,
  alignX = defaultAlignX,
  alignY = defaultAlignY,

  css,
  contentCss,
  beforeContentCss,
  afterContentCss,

  contentDirection = defaultContentDirection,
  contentAlignX = defaultAlignX,
  contentAlignY = defaultAlignY,

  beforeContentDirection = defaultDirection,
  beforeContentAlignX = defaultAlignX,
  beforeContentAlignY = defaultAlignY,

  afterContentDirection = defaultDirection,
  afterContentAlignX = defaultAlignX,
  afterContentAlignY = defaultAlignY,

  ref,
  ...props
}) => {
  // --------------------------------------------------------
  // check if should render only single element
  // --------------------------------------------------------
  const shouldBeEmpty = !!props.dangerouslySetInnerHTML || getShouldBeEmpty(tag);

  // --------------------------------------------------------
  // if not single element, calculate values
  // --------------------------------------------------------
  const isSimpleElement = !beforeContent && !afterContent;
  const CHILDREN = children ?? content ?? label;

  const isInline = isInlineElement(tag);
  const SUB_TAG = isInline ? "span" : undefined;

  // --------------------------------------------------------
  // direction & alignX & alignY calculations
  // --------------------------------------------------------
  let wrapperDirection: typeof direction = direction;
  let wrapperAlignX: typeof alignX = alignX;
  let wrapperAlignY: typeof alignY = alignY;

  if (isSimpleElement) {
    if (contentDirection) wrapperDirection = contentDirection;
    if (contentAlignX) wrapperAlignX = contentAlignX;
    if (contentAlignY) wrapperAlignY = contentAlignY;
  } else if (direction) {
    wrapperDirection = direction;
  } else {
    wrapperDirection = defaultDirection;
  }

  // --------------------------------------------------------
  // equalBeforeAfter: measure & equalize slot dimensions
  // --------------------------------------------------------
  let equalizeRef: HTMLElement | null = null;
  const externalRef = ref ?? innerRef;

  const mergedRef = (node: HTMLElement | null) => {
    equalizeRef = node;
    if (typeof externalRef === "function") externalRef(node);
    else if (externalRef != null) {
      (externalRef as unknown as { current: HTMLElement | null }).current = node;
    }
  };

  if (equalBeforeAfter && beforeContent && afterContent) {
    onMount(() => {
      if (equalizeRef) equalize(equalizeRef, direction);
      return undefined;
    });
  }

  // --------------------------------------------------------
  // common wrapper props
  // --------------------------------------------------------
  const WRAPPER_PROPS = {
    ref: mergedRef,
    extendCss: css,
    tag,
    block,
    direction: wrapperDirection,
    alignX: wrapperAlignX,
    alignY: wrapperAlignY,
    as: undefined, // reset styled-components `as` prop
  };

  // --------------------------------------------------------
  // return simple/empty element like input or image etc.
  // --------------------------------------------------------
  if (shouldBeEmpty) {
    return <Wrapper {...props} {...WRAPPER_PROPS} />;
  }

  return (
    <Wrapper {...props} {...WRAPPER_PROPS} isInline={isInline}>
      {beforeContent && (
        <Content
          tag={SUB_TAG}
          contentType="before"
          parentDirection={wrapperDirection}
          extendCss={beforeContentCss}
          direction={beforeContentDirection}
          alignX={beforeContentAlignX}
          alignY={beforeContentAlignY}
          equalCols={equalCols}
          gap={gap}
        >
          {beforeContent}
        </Content>
      )}

      {isSimpleElement ? (
        render(CHILDREN)
      ) : (
        <Content
          tag={SUB_TAG}
          contentType="content"
          parentDirection={wrapperDirection}
          extendCss={contentCss}
          direction={contentDirection}
          alignX={contentAlignX}
          alignY={contentAlignY}
          equalCols={equalCols}
        >
          {CHILDREN}
        </Content>
      )}

      {afterContent && (
        <Content
          tag={SUB_TAG}
          contentType="after"
          parentDirection={wrapperDirection}
          extendCss={afterContentCss}
          direction={afterContentDirection}
          alignX={afterContentAlignX}
          alignY={afterContentAlignY}
          equalCols={equalCols}
          gap={gap}
        >
          {afterContent}
        </Content>
      )}
    </Wrapper>
  );
};

const name = `${PKG_NAME}/Element` as const;

Component.displayName = name;
Component.pkgName = PKG_NAME;
Component.PYREON__COMPONENT = name;

export default Component;
