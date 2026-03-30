import type { VNode } from "@pyreon/core";
import { Fragment, h } from "@pyreon/core";
import { describe, expect, it } from "vitest";
import renderFn from "../render";

const TestComponent = (props: { label?: string }) => {
  return h("span", { "data-testid": "test" }, props.label ?? "default");
};

describe("render", () => {
  it("should return null for falsy content", () => {
    expect(renderFn(null)).toBeNull();
    expect(renderFn(undefined)).toBeNull();
    expect(renderFn(false as any)).toBeNull();
    expect(renderFn("" as any)).toBeNull();
  });

  it("should render a component with props", () => {
    const result = renderFn(TestComponent, { label: "hello" }) as VNode;
    expect(result).toBeDefined();
    expect(result.type).toBe(TestComponent);
    expect(result.props.label).toBe("hello");
  });

  it("should render a component without props", () => {
    const result = renderFn(TestComponent) as VNode;
    expect(result).toBeDefined();
    expect(result.type).toBe(TestComponent);
  });

  it("should return string content as-is (treated as text)", () => {
    expect(renderFn("div" as any)).toBe("div");
    expect(renderFn("hello" as any)).toBe("hello");
  });

  it("should return primitive values as-is", () => {
    expect(renderFn(42 as any)).toBe(42);
    expect(renderFn(true as any)).toBe(true);
    expect(renderFn("text" as any)).toBe("text");
  });

  it("should return arrays as-is", () => {
    const arr = [h("span", { key: "1" }, "a"), h("span", { key: "2" }, "b")];
    expect(renderFn(arr as any)).toBe(arr);
  });

  it("should return a VNode object without modification when no props", () => {
    const vnode = h(TestComponent, { label: "original" });
    const result = renderFn(vnode as any);
    // VNode objects are returned as-is
    expect(result).toBe(vnode);
  });

  it("should return a VNode object as-is even with props (VNode path does not merge)", () => {
    const vnode = h(TestComponent, { label: "original" });
    const result = renderFn(vnode as any, { label: "cloned" });
    // In Pyreon's render, VNode objects hit the object branch and are returned as-is
    expect(result).toBe(vnode);
  });

  it("should return fragment as-is", () => {
    const frag = h(Fragment, null, h("span", null, "a"), h("span", null, "b"));
    const result = renderFn(frag as any);
    expect(result).toBe(frag);
  });

  it("should return plain object as-is (fallback branch)", () => {
    // Plain objects are not valid elements, not primitives, not arrays
    const obj = { foo: "bar" };
    expect(renderFn(obj as any)).toBe(obj);
  });
});
