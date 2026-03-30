/**
 * JSX type compatibility test — verifies all JSX patterns produce correct VNodes.
 * Uses h() directly since core's vitest config doesn't have JSX transform.
 * TypeScript already validates JSX types via typecheck (tsc --noEmit).
 */
import { createRef, Fragment, h } from "../index";

describe("JSX type compat (via h)", () => {
  test("basic element", () => {
    const el = h("div", { class: "hello" }, "world");
    expect(el.type).toBe("div");
    expect(el.props.class).toBe("hello");
  });

  test("callback ref", () => {
    let _captured: Element | null = null;
    const el = h(
      "div",
      {
        ref: (e: Element) => {
          _captured = e;
        },
      },
      "test",
    );
    expect(typeof el.props.ref).toBe("function");
  });

  test("object ref", () => {
    const myRef = createRef<HTMLDivElement>();
    const el = h("div", { ref: myRef }, "test");
    expect(el.props.ref).toBe(myRef);
  });

  test("reactive class prop", () => {
    const el = h("span", { class: () => "active" }, "hello");
    expect(typeof el.props.class).toBe("function");
  });

  test("input with typed props", () => {
    const el = h("input", { type: "text", value: "test" });
    expect(el.type).toBe("input");
    expect(el.props.type).toBe("text");
  });

  test("component with children", () => {
    const MyComp = (props: { name: string; children?: unknown }) => {
      return h("div", null, String(props.name));
    };
    const el = h(MyComp, { name: "test" }, "child");
    expect(typeof el.type).toBe("function");
    expect(el.props.name).toBe("test");
  });

  test("fragment", () => {
    const el = h(Fragment, null, "fragment");
    expect(el.type).toBe(Fragment);
  });

  test("event handler", () => {
    const handler = vi.fn();
    const el = h("button", { onClick: handler }, "click");
    expect(el.props.onClick).toBe(handler);
  });

  test("style as object", () => {
    const el = h("div", { style: { color: "red" } }, "styled");
    expect(el.props.style).toEqual({ color: "red" });
  });

  test("data attributes", () => {
    const el = h("div", { "data-testid": "foo" }, "test");
    expect(el.props["data-testid"]).toBe("foo");
  });

  test("aria attributes", () => {
    const el = h("div", { "aria-label": "close", role: "button" });
    expect(el.props["aria-label"]).toBe("close");
    expect(el.props.role).toBe("button");
  });

  test("key prop", () => {
    const el = h("li", { key: "item-1" }, "item");
    expect(el.key).toBe("item-1");
  });
});
