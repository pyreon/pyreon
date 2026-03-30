import { Dynamic } from "../dynamic";
import { h } from "../h";
import type { ComponentFn, VNode } from "../types";

describe("Dynamic", () => {
  test("renders component function", () => {
    const Greeting: ComponentFn = (props) => h("span", null, (props as { name: string }).name);
    const result = Dynamic({ component: Greeting, name: "world" });
    expect(result).not.toBeNull();
    expect((result as VNode).type).toBe(Greeting);
    expect((result as VNode).props).toEqual({ name: "world" });
  });

  test("renders string element", () => {
    const result = Dynamic({ component: "div", class: "box", id: "main" });
    expect(result).not.toBeNull();
    expect((result as VNode).type).toBe("div");
    expect((result as VNode).props).toEqual({ class: "box", id: "main" });
  });

  test("strips component prop from rest props", () => {
    const result = Dynamic({ component: "span", id: "x" });
    expect((result as VNode).props.component).toBeUndefined();
    expect((result as VNode).props.id).toBe("x");
  });

  test("returns null for empty string component", () => {
    const result = Dynamic({ component: "" });
    expect(result).toBeNull();
  });

  test("warns when component prop is falsy", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Dynamic({ component: "" });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("<Dynamic>"));
    warnSpy.mockRestore();
  });

  test("passes all extra props to the rendered component", () => {
    const Comp: ComponentFn = (props) => h("div", null, JSON.stringify(props));
    const result = Dynamic({
      component: Comp,
      a: 1,
      b: "two",
      c: true,
    });
    expect((result as VNode).props).toEqual({ a: 1, b: "two", c: true });
  });

  test("renders with no extra props", () => {
    const result = Dynamic({ component: "br" });
    expect(result).not.toBeNull();
    expect((result as VNode).type).toBe("br");
  });
});
