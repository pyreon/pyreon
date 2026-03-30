import type { ComponentFn } from "@pyreon/core";
import { ErrorBoundary as CoreEB, Show as CoreShow, Suspense as CoreSuspense } from "@pyreon/core";
import { mount } from "@pyreon/runtime-dom";
import {
  children,
  createSignal,
  ErrorBoundary,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from "../index";
import { jsx } from "../jsx-runtime";

describe("DOM integration - children helper", () => {
  it("children helper should render VNode children, not [object Object]", () => {
    function ColoredBox(props: { color: string; children?: any }) {
      const resolved = children(() => props.children);
      return jsx("div", {
        style: `border: 2px solid ${props.color}`,
        children: resolved(),
      });
    }

    function App() {
      return jsx(ColoredBox as ComponentFn, {
        color: "blue",
        children: jsx("p", { children: "Hello" }),
      });
    }

    const container = document.createElement("div");
    mount(jsx(App, {}), container);

    expect(container.innerHTML).not.toContain("[object Object]");
    expect(container.innerHTML).toContain("<p>Hello</p>");
  });

  it("simple compat component renders children correctly", () => {
    function Wrapper(props: { children?: any }) {
      return jsx("div", { class: "wrapper", children: props.children });
    }

    function App() {
      return jsx(Wrapper as ComponentFn, {
        children: jsx("span", { children: "inner" }),
      });
    }

    const container = document.createElement("div");
    mount(jsx(App, {}), container);

    expect(container.innerHTML).not.toContain("[object Object]");
    expect(container.innerHTML).toContain("<span>inner</span>");
  });

  it("re-exported Show/Suspense/ErrorBoundary are same references as core", () => {
    expect(Show).toBe(CoreShow);
    expect(Suspense).toBe(CoreSuspense);
    expect(ErrorBoundary).toBe(CoreEB);
  });

  it("Show from solid-compat works through compat jsx runtime", () => {
    const [visible] = createSignal(true);

    function App() {
      return jsx(Show as ComponentFn, {
        when: visible,
        children: jsx("p", { children: "visible!" }),
      });
    }

    const container = document.createElement("div");
    mount(jsx(App, {}), container);

    expect(container.innerHTML).toContain("visible!");
    expect(container.innerHTML).not.toContain("[object Object]");
  });

  it("nested compat components with children pass-through", () => {
    function Demo(props: { title: string; children?: any }) {
      return jsx("section", {
        children: [jsx("h2", { children: props.title }), props.children],
      });
    }

    function ColoredBox(props: { color: string; children?: any }) {
      const resolved = children(() => props.children);
      return jsx("div", {
        style: `border: 2px solid ${props.color}`,
        children: resolved(),
      });
    }

    function App() {
      return jsx(Demo as ComponentFn, {
        title: "Test",
        children: jsx(ColoredBox as ComponentFn, {
          color: "blue",
          children: jsx("p", { children: "Hello" }),
        }),
      });
    }

    const container = document.createElement("div");
    mount(jsx(App, {}), container);

    expect(container.innerHTML).not.toContain("[object Object]");
    expect(container.innerHTML).toContain("<p>Hello</p>");
    expect(container.innerHTML).toContain("<h2>Test</h2>");
  });
});

describe("child instance preservation - no infinite re-render", () => {
  it("onMount in child does not cause infinite loop when writing parent state", async () => {
    let mountCount = 0;

    function Inner(props: { onEvent: (msg: string) => void }) {
      onMount(() => {
        mountCount++;
        props.onEvent("mounted");
      });
      return jsx("p", { children: "alive" });
    }

    function Parent() {
      const [_events, setEvents] = createSignal<string[]>([]);
      const addEvent = (msg: string) => setEvents((prev) => [...prev, msg]);

      return jsx("div", {
        children: jsx(Inner as ComponentFn, { onEvent: addEvent }),
      });
    }

    const container = document.createElement("div");
    mount(jsx(Parent, {}), container);

    // Wait for microtasks (onMount fires via microtask, re-render via microtask)
    await new Promise((r) => setTimeout(r, 100));

    // onMount should fire only once, not loop infinitely
    expect(mountCount).toBeLessThanOrEqual(2);
    expect(container.innerHTML).toContain("alive");
  });

  it("onCleanup in child does not cause infinite loop when writing parent state", async () => {
    let cleanupCount = 0;

    function Inner(props: { onEvent: (msg: string) => void }) {
      onCleanup(() => {
        cleanupCount++;
        props.onEvent("cleaned up");
      });
      return jsx("p", { children: "alive" });
    }

    function Parent() {
      const [show, _setShow] = createSignal(true);
      const [_events, setEvents] = createSignal<string[]>([]);
      const addEvent = (msg: string) => setEvents((prev) => [...prev, msg]);

      return jsx("div", {
        children: jsx(Show as ComponentFn, {
          when: show,
          children: jsx(Inner as ComponentFn, { onEvent: addEvent }),
        }),
      });
    }

    const container = document.createElement("div");
    mount(jsx(Parent, {}), container);

    await new Promise((r) => setTimeout(r, 100));

    // onCleanup should not fire during normal render
    expect(cleanupCount).toBe(0);
    expect(container.innerHTML).toContain("alive");
  });
});
