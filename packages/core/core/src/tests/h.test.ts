import { EMPTY_PROPS, Fragment, h } from "../h";
import type { ComponentFn, VNode, VNodeChild } from "../types";

describe("h() — VNode creation", () => {
  describe("basic element creation", () => {
    test("creates VNode with string tag", () => {
      const node = h("div", null);
      expect(node.type).toBe("div");
      expect(node.props).toBe(EMPTY_PROPS);
      expect(node.children).toEqual([]);
      expect(node.key).toBeNull();
    });

    test("creates VNode with props", () => {
      const node = h("div", { id: "main", class: "container" });
      expect(node.props.id).toBe("main");
      expect(node.props.class).toBe("container");
    });

    test("null props becomes EMPTY_PROPS sentinel", () => {
      const node1 = h("div", null);
      const node2 = h("span", null);
      // Both should use the same EMPTY_PROPS object (identity check)
      expect(node1.props).toBe(node2.props);
      expect(node1.props).toBe(EMPTY_PROPS);
    });
  });

  describe("key extraction", () => {
    test("extracts string key from props", () => {
      const node = h("li", { key: "item-1" });
      expect(node.key).toBe("item-1");
    });

    test("extracts numeric key from props", () => {
      const node = h("li", { key: 42 });
      expect(node.key).toBe(42);
    });

    test("key is null when not provided", () => {
      const node = h("div", { class: "x" });
      expect(node.key).toBeNull();
    });

    test("key is null for null props", () => {
      const node = h("div", null);
      expect(node.key).toBeNull();
    });

    test("key 0 is preserved (falsy but valid)", () => {
      const node = h("li", { key: 0 });
      expect(node.key).toBe(0);
    });
  });

  describe("children handling", () => {
    test("string children", () => {
      const node = h("p", null, "hello");
      expect(node.children).toEqual(["hello"]);
    });

    test("multiple string children", () => {
      const node = h("p", null, "hello", " ", "world");
      expect(node.children).toEqual(["hello", " ", "world"]);
    });

    test("number children", () => {
      const node = h("span", null, 42);
      expect(node.children).toEqual([42]);
    });

    test("VNode children", () => {
      const child = h("span", null, "inner");
      const parent = h("div", null, child);
      expect(parent.children).toHaveLength(1);
      expect((parent.children[0] as VNode).type).toBe("span");
    });

    test("mixed children types", () => {
      const child = h("em", null);
      const getter = () => "reactive";
      const node = h("div", null, "text", 42, child, null, undefined, true, false, getter);
      expect(node.children).toHaveLength(8);
      expect(node.children[0]).toBe("text");
      expect(node.children[1]).toBe(42);
      expect((node.children[2] as VNode).type).toBe("em");
      expect(node.children[3]).toBeNull();
      expect(node.children[4]).toBeUndefined();
      expect(node.children[5]).toBe(true);
      expect(node.children[6]).toBe(false);
      expect(typeof node.children[7]).toBe("function");
    });

    test("function children (reactive getters) are preserved", () => {
      const getter = () => "dynamic";
      const node = h("div", null, getter);
      expect(node.children).toHaveLength(1);
      expect(typeof node.children[0]).toBe("function");
      expect((node.children[0] as () => string)()).toBe("dynamic");
    });

    test("no children produces empty array", () => {
      const node = h("br", null);
      expect(node.children).toEqual([]);
    });
  });

  describe("children flattening", () => {
    test("flattens single-level array children", () => {
      const node = h("ul", null, [h("li", null, "a"), h("li", null, "b")]);
      expect(node.children).toHaveLength(2);
      expect((node.children[0] as VNode).type).toBe("li");
      expect((node.children[1] as VNode).type).toBe("li");
    });

    test("flattens deeply nested arrays", () => {
      const node = h("div", null, [[["deep"]]] as unknown as VNodeChild);
      expect(node.children).toEqual(["deep"]);
    });

    test("flattens mixed nested/flat children", () => {
      const node = h("div", null, "flat", ["nested-a", "nested-b"] as unknown as VNodeChild);
      expect(node.children).toEqual(["flat", "nested-a", "nested-b"]);
    });

    test("fast path: no allocation when children have no nested arrays", () => {
      // normalizeChildren returns as-is when no element is an array
      const node = h("div", null, "a", "b", "c");
      expect(node.children).toEqual(["a", "b", "c"]);
      expect(node.children).toHaveLength(3);
    });

    test("flattens multiple levels of nesting", () => {
      const node = h("div", null, [["a", ["b", ["c"]]]] as unknown as VNodeChild);
      expect(node.children).toEqual(["a", "b", "c"]);
    });
  });

  describe("component function type", () => {
    test("accepts component function as type", () => {
      const Comp: ComponentFn<{ name: string }> = (props) => h("span", null, props.name);
      const node = h(Comp, { name: "test" });
      expect(node.type).toBe(Comp);
      expect(node.props.name).toBe("test");
    });

    test("component with no props", () => {
      const Comp: ComponentFn = () => h("div", null);
      const node = h(Comp, null);
      expect(node.type).toBe(Comp);
      expect(node.props).toBe(EMPTY_PROPS);
    });

    test("component with children rest args", () => {
      const Comp: ComponentFn = () => null;
      const node = h(Comp, { id: "x" }, "child1", "child2");
      expect(node.children).toEqual(["child1", "child2"]);
    });
  });

  describe("symbol type (Fragment)", () => {
    test("Fragment as type", () => {
      const node = h(Fragment, null, "a", "b");
      expect(node.type).toBe(Fragment);
      expect(node.children).toEqual(["a", "b"]);
    });

    test("Fragment with VNode children", () => {
      const node = h(Fragment, null, h("span", null, "x"), h("em", null, "y"));
      expect(node.children).toHaveLength(2);
    });

    test("nested Fragments", () => {
      const inner = h(Fragment, null, "a", "b");
      const outer = h(Fragment, null, inner, "c");
      expect(outer.children).toHaveLength(2);
      expect((outer.children[0] as VNode).type).toBe(Fragment);
    });
  });
});

describe("EMPTY_PROPS", () => {
  test("is a plain object", () => {
    expect(typeof EMPTY_PROPS).toBe("object");
    expect(EMPTY_PROPS).not.toBeNull();
  });

  test("is the same reference for all null-prop VNodes", () => {
    const a = h("div", null);
    const b = h("span", null);
    expect(a.props).toBe(b.props);
  });
});

describe("Fragment", () => {
  test("is a unique symbol", () => {
    expect(typeof Fragment).toBe("symbol");
    expect(Fragment.toString()).toContain("Pyreon.Fragment");
  });
});
