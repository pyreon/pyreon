import { createContext, Fragment, h, provide, useContext } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";
import { mount } from "@pyreon/runtime-dom";
import { describe, expect, it } from "vitest";

const TestCtx = createContext("default");

describe("context inheritance through reactive boundaries", () => {
  it("child inside reactive accessor inherits parent context", async () => {
    let childValue: string | undefined;

    function Child() {
      childValue = useContext(TestCtx);
      return h("span", null, childValue);
    }

    function Parent() {
      provide(TestCtx, "from-parent");
      const show = signal(false);
      setTimeout(() => show.set(true), 10);
      return () => (show() ? h(Child, null) : null);
    }

    const container = document.createElement("div");
    mount(h(Parent, null), container);
    await new Promise((r) => setTimeout(r, 50));
    expect(childValue).toBe("from-parent");
  });

  it("deeply nested context survives through multiple reactive layers", async () => {
    let innerValue: string | undefined;

    function Inner() {
      innerValue = useContext(TestCtx);
      return h("span", null, innerValue);
    }

    function Middle() {
      const show = signal(false);
      setTimeout(() => show.set(true), 10);
      return () => (show() ? h(Inner, null) : null);
    }

    function Outer() {
      provide(TestCtx, "outer-value");
      const show = signal(false);
      setTimeout(() => show.set(true), 5);
      return () => (show() ? h(Middle, null) : null);
    }

    const container = document.createElement("div");
    mount(h(Outer, null), container);
    await new Promise((r) => setTimeout(r, 100));
    expect(innerValue).toBe("outer-value");
  });

  it("sibling providers don't leak context to each other", async () => {
    let childAValue: string | undefined;
    let childBValue: string | undefined;

    function ChildA() {
      childAValue = useContext(TestCtx);
      return h("span", null, childAValue);
    }

    function ChildB() {
      childBValue = useContext(TestCtx);
      return h("span", null, childBValue);
    }

    function ProviderA() {
      provide(TestCtx, "A");
      return h(ChildA, null);
    }

    function ProviderB() {
      provide(TestCtx, "B");
      return h(ChildB, null);
    }

    function App() {
      return h(Fragment, null, h(ProviderA, null), h(ProviderB, null));
    }

    const container = document.createElement("div");
    mount(h(App, null), container);
    await new Promise((r) => setTimeout(r, 50));

    expect(childAValue).toBe("A");
    expect(childBValue).toBe("B");
  });

  it("Show toggle preserves context across hide/show cycle", async () => {
    let childValue: string | undefined;
    let mountCount = 0;

    function Child() {
      mountCount++;
      childValue = useContext(TestCtx);
      return h("span", null, childValue);
    }

    function Parent() {
      provide(TestCtx, "persistent");
      const show = signal(true);

      // Hide then show again
      setTimeout(() => show.set(false), 10);
      setTimeout(() => show.set(true), 30);

      return () => (show() ? h(Child, null) : null);
    }

    const container = document.createElement("div");
    mount(h(Parent, null), container);
    await new Promise((r) => setTimeout(r, 100));

    expect(childValue).toBe("persistent");
    expect(mountCount).toBe(2); // mounted twice (initial + re-show)
  });

  it("reactive context getter updates JSX without re-running component", async () => {
    const ModeCtx = createContext<() => string>(() => "light");
    let renderCount = 0;

    function Child() {
      const getMode = useContext(ModeCtx);
      renderCount++;
      // Reading the getter inside a reactive accessor — updates when mode changes
      return h("span", null, () => getMode());
    }

    function Parent() {
      const mode = signal<string>("light");
      provide(ModeCtx, () => mode());
      setTimeout(() => mode.set("dark"), 10);
      return h(Child, null);
    }

    const container = document.createElement("div");
    mount(h(Parent, null), container);

    expect(container.textContent).toBe("light");

    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe("dark");
    // Component setup ran once — JSX expression re-evaluated reactively
    expect(renderCount).toBe(1);
  });

  it("nested Show inside For with context", async () => {
    const ItemCtx = createContext("none");
    const collected: string[] = [];

    function Item() {
      const val = useContext(ItemCtx);
      collected.push(val);
      return h("li", null, val);
    }

    function Parent() {
      provide(ItemCtx, "parent-provided");
      const items = signal([1, 2, 3]);
      const show = signal(false);
      setTimeout(() => show.set(true), 10);

      return () => (show() ? h("ul", null, ...items().map((i) => h(Item, { key: i }))) : null);
    }

    const container = document.createElement("div");
    mount(h(Parent, null), container);
    await new Promise((r) => setTimeout(r, 50));

    expect(collected.length).toBe(3);
    expect(collected.every((v) => v === "parent-provided")).toBe(true);
  });
});
