/**
 * Data-driven list renderer that supports three input modes: children,
 * an array of primitives, or an array of objects.
 * Each item receives positional metadata (first, last, odd, even, position)
 * and optional injected props via `itemProps`. Items can be individually
 * wrapped with `wrapComponent`. Children always take priority over the
 * component+data prop pattern.
 */

import type { VNode, VNodeChild } from "@pyreon/core";
import { Fragment } from "@pyreon/core";
import { isEmpty, render } from "@pyreon/ui-core";
import type { ExtendedProps, ObjectValue, Props, SimpleValue } from "./types";

type ClassifiedData =
  | { type: "simple"; data: SimpleValue[] }
  | { type: "complex"; data: ObjectValue[] }
  | null;

const classifyData = (data: unknown[]): ClassifiedData => {
  const items = data.filter(
    (item) =>
      item != null && !(typeof item === "object" && isEmpty(item as Record<string, unknown>)),
  );

  if (items.length === 0) return null;

  let isSimple = true;
  let isComplex = true;

  for (const item of items) {
    if (typeof item === "string" || typeof item === "number") {
      isComplex = false;
    } else if (typeof item === "object") {
      isSimple = false;
    } else {
      isSimple = false;
      isComplex = false;
    }
  }

  if (isSimple) return { type: "simple", data: items as SimpleValue[] };
  if (isComplex) return { type: "complex", data: items as ObjectValue[] };
  return null;
};

const RESERVED_PROPS = [
  "children",
  "component",
  "wrapComponent",
  "data",
  "itemKey",
  "valueName",
  "itemProps",
  "wrapProps",
] as const;

type AttachItemProps = ({ i, length }: { i: number; length: number }) => ExtendedProps;

const attachItemProps: AttachItemProps = ({ i, length }: { i: number; length: number }) => {
  const position = i + 1;

  return {
    index: i,
    first: position === 1,
    last: position === length,
    odd: position % 2 === 1,
    even: position % 2 === 0,
    position,
  };
};

const Component = (props: Props) => {
  const {
    itemKey,
    valueName,
    children,
    component,
    data,
    wrapComponent: Wrapper,
    wrapProps,
    itemProps,
  } = props;

  const injectItemProps = typeof itemProps === "function" ? itemProps : () => itemProps;

  const injectWrapItemProps = typeof wrapProps === "function" ? wrapProps : () => wrapProps;

  const getKey = (item: string | number, index: number) => {
    if (typeof itemKey === "function") return itemKey(item, index);
    return index;
  };

  const renderChild = (child: VNodeChild, total = 1, i = 0) => {
    if (!itemProps && !Wrapper) return child;

    const extendedProps = attachItemProps({
      i,
      length: total,
    });

    const finalItemProps = itemProps ? injectItemProps({}, extendedProps) : {};

    if (Wrapper) {
      const finalWrapProps = wrapProps ? injectWrapItemProps({}, extendedProps) : {};

      return (
        <Wrapper key={i} {...finalWrapProps}>
          {render(child, finalItemProps)}
        </Wrapper>
      );
    }

    return render(child, {
      key: i,
      ...finalItemProps,
    });
  };

  // --------------------------------------------------------
  // render children
  // --------------------------------------------------------
  const renderChildren = () => {
    if (!children) return null;

    // if children is Array
    if (Array.isArray(children)) {
      return children.map((item, i) => renderChild(item, children.length, i));
    }

    // if children is Fragment — check VNode type
    if (
      typeof children === "object" &&
      "type" in (children as VNode) &&
      (children as VNode).type === Fragment
    ) {
      const fragmentChildren = (children as VNode).children as VNodeChild[];
      const childrenLength = fragmentChildren.length;

      return fragmentChildren.map((item, i) => renderChild(item, childrenLength, i));
    }

    // if single child
    return renderChild(children);
  };

  // --------------------------------------------------------
  // render array of strings or numbers
  // --------------------------------------------------------
  const renderSimpleArray = (simpleData: SimpleValue[]) => {
    const { length } = simpleData;

    if (length === 0) return null;

    return simpleData.map((item, i) => {
      const key = getKey(item, i);
      const keyName = valueName ?? "children";
      const extendedProps = attachItemProps({
        i,
        length,
      });

      const finalItemProps = {
        ...(itemProps ? injectItemProps({ [keyName]: item }, extendedProps) : {}),
        [keyName]: item,
      };

      if (Wrapper) {
        const finalWrapProps = wrapProps
          ? injectWrapItemProps({ [keyName]: item }, extendedProps)
          : {};

        return (
          <Wrapper key={key} {...finalWrapProps}>
            {render(component, finalItemProps)}
          </Wrapper>
        );
      }

      return render(component, { key, ...finalItemProps });
    });
  };

  // --------------------------------------------------------
  // render array of objects
  // --------------------------------------------------------
  const getObjectKey = (item: ObjectValue, index: number) => {
    if (!itemKey) return item.key ?? item.id ?? item.itemId ?? index;
    if (typeof itemKey === "function") return itemKey(item, index);
    if (typeof itemKey === "string") return item[itemKey];

    return index;
  };

  const renderComplexArray = (complexData: ObjectValue[]) => {
    const { length } = complexData;

    if (length === 0) return null;

    return complexData.map((item, i) => {
      const { component: itemComponent, ...restItem } = item;
      const renderItem = itemComponent ?? component;
      const key = getObjectKey(restItem, i);
      const extendedProps = attachItemProps({
        i,
        length,
      });

      const finalItemProps = {
        ...(itemProps ? injectItemProps(item, extendedProps) : {}),
        ...restItem,
      };

      if (Wrapper && !itemComponent) {
        const finalWrapProps = wrapProps ? injectWrapItemProps(item, extendedProps) : {};

        return (
          <Wrapper key={key} {...finalWrapProps}>
            {render(renderItem, finalItemProps)}
          </Wrapper>
        );
      }

      return render(renderItem, { key, ...finalItemProps });
    });
  };

  // --------------------------------------------------------
  // render list items
  // --------------------------------------------------------
  const renderItems = (): VNodeChild => {
    // children have priority over props component + data
    if (children) return renderChildren() as VNodeChild;

    // render props component + data
    if (component && Array.isArray(data)) {
      const classified = classifyData(data);
      if (!classified) return null;
      if (classified.type === "simple") return renderSimpleArray(classified.data) as VNodeChild;
      return renderComplexArray(classified.data) as VNodeChild;
    }

    return null;
  };

  return renderItems();
};

export default Object.assign(Component, {
  isIterator: true as const,
  RESERVED_PROPS,
});
