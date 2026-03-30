import type { VNode } from "@pyreon/core";
import StaggerRenderer from "../kinetic/StaggerRenderer";
import type { KineticConfig } from "../kinetic/types";

// Mock rAF for deterministic testing
let rafCallbacks: (() => void)[] = [];
const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

beforeEach(() => {
  vi.useFakeTimers();
  rafCallbacks = [];

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: () => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }),
  );

  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.stubGlobal("requestAnimationFrame", originalRaf);
  vi.stubGlobal("cancelAnimationFrame", originalCaf);
});

const makeConfig = (overrides: Partial<KineticConfig> = {}): KineticConfig => ({
  tag: "div",
  mode: "stagger",
  enter: "s-enter",
  enterFrom: "s-enter-from",
  enterTo: "s-enter-to",
  leave: "s-leave",
  leaveFrom: "s-leave-from",
  leaveTo: "s-leave-to",
  ...overrides,
});

const makeChild = (key: string | number, text: string): VNode => ({
  type: "span",
  props: { "data-testid": `child-${key}` },
  children: [text],
  key,
});

/**
 * Extract the cloned child VNode from a TransitionItem VNode.
 *
 * With Pyreon's automatic JSX runtime, component children are placed in
 * props.children (not in vnode.children). We check both locations for safety.
 */
const extractStaggerChild = (tiVNode: VNode): VNode | null => {
  // For automatic JSX runtime, children are in props.children
  const props = tiVNode.props as Record<string, unknown>;
  if (props?.children) {
    const pc = Array.isArray(props.children) ? props.children : [props.children];
    for (const c of pc) {
      if (c && typeof c === "object" && "type" in (c as object)) return c as VNode;
    }
  }
  // Fallback: check vnode.children (classic runtime)
  if (tiVNode.children) {
    const ch = Array.isArray(tiVNode.children) ? tiVNode.children : [tiVNode.children];
    for (const c of ch) {
      if (c && typeof c === "object" && "type" in (c as object)) return c as VNode;
    }
  }
  return null;
};

describe("StaggerRenderer", () => {
  it("returns a VNode wrapping children in config.tag", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.type).toBe("div");
  });

  it("uses custom tag from config", () => {
    const config = makeConfig({ tag: "ul" });
    const children = [makeChild("a", "Alpha")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    expect(vnode?.type).toBe("ul");
  });

  it("passes htmlProps to the wrapper element", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: { "data-testid": "stagger-wrapper", class: "my-stagger" },
      show: () => true,
      callbacks: {},
      children,
    });

    const props = vnode?.props as Record<string, unknown>;
    expect(props?.["data-testid"]).toBe("stagger-wrapper");
    expect(props?.class).toBe("my-stagger");
  });

  it("wraps each child in a TransitionItem", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children;
    const childArray = Array.isArray(wrapperChildren) ? wrapperChildren : [wrapperChildren];
    expect(childArray.length).toBe(3);

    for (const child of childArray) {
      const childVNode = child as VNode;
      expect(typeof childVNode.type).toBe("function");
    }
  });

  it("injects --stagger-index CSS custom property on each child", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    for (let i = 0; i < wrapperChildren.length; i++) {
      const clonedChild = extractStaggerChild(wrapperChildren[i] as VNode);
      const childProps = clonedChild?.props as Record<string, unknown>;
      const style = childProps?.style as Record<string, unknown>;

      expect(style?.["--stagger-index"]).toBe(i);
    }
  });

  it("injects --stagger-interval CSS custom property on each child", () => {
    const config = makeConfig({ interval: 100 });
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 100,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    for (const child of wrapperChildren) {
      const clonedChild = extractStaggerChild(child as VNode);
      const childProps = clonedChild?.props as Record<string, unknown>;
      const style = childProps?.style as Record<string, unknown>;

      expect(style?.["--stagger-interval"]).toBe("100ms");
    }
  });

  it("applies transitionDelay based on interval * index", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 75,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    for (let i = 0; i < wrapperChildren.length; i++) {
      const clonedChild = extractStaggerChild(wrapperChildren[i] as VNode);
      const childProps = clonedChild?.props as Record<string, unknown>;
      const style = childProps?.style as Record<string, unknown>;

      expect(style?.transitionDelay).toBe(`${i * 75}ms`);
    }
  });

  it("uses default interval of 50ms when not specified", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    // Check second child has 50ms delay (index=1 * 50ms)
    const clonedChild = extractStaggerChild(wrapperChildren[1] as VNode);
    const childProps = clonedChild?.props as Record<string, unknown>;
    const style = childProps?.style as Record<string, unknown>;

    expect(style?.transitionDelay).toBe("50ms");
    expect(style?.["--stagger-interval"]).toBe("50ms");
  });

  it("reverseLeave reverses stagger index order on leave", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    // show=false with reverseLeave=true
    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => false,
      interval: 100,
      reverseLeave: true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];
    const count = wrapperChildren.length;

    // With reverseLeave, staggerIndex = count - 1 - index
    // For 3 children: child 0 gets index 2, child 1 gets index 1, child 2 gets index 0
    for (let i = 0; i < count; i++) {
      const expectedStaggerIndex = count - 1 - i;
      const clonedChild = extractStaggerChild(wrapperChildren[i] as VNode);
      const childProps = clonedChild?.props as Record<string, unknown>;
      const style = childProps?.style as Record<string, unknown>;

      expect(style?.["--stagger-index"]).toBe(expectedStaggerIndex);
      expect(style?.transitionDelay).toBe(`${expectedStaggerIndex * 100}ms`);
    }
  });

  it("does not reverse stagger index when show is true even if reverseLeave is true", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 100,
      reverseLeave: true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    // Normal order when showing
    for (let i = 0; i < wrapperChildren.length; i++) {
      const clonedChild = extractStaggerChild(wrapperChildren[i] as VNode);
      const childProps = clonedChild?.props as Record<string, unknown>;
      const style = childProps?.style as Record<string, unknown>;

      expect(style?.["--stagger-index"]).toBe(i);
    }
  });

  it("passes transition class config to TransitionItem children", () => {
    const config = makeConfig({
      enter: "custom-enter",
      enterFrom: "custom-from",
      enterTo: "custom-to",
      leave: "custom-leave",
      leaveFrom: "custom-lfrom",
      leaveTo: "custom-lto",
    });
    const children = [makeChild("a", "Alpha")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>;

    expect(tiProps.enter).toBe("custom-enter");
    expect(tiProps.enterFrom).toBe("custom-from");
    expect(tiProps.enterTo).toBe("custom-to");
    expect(tiProps.leave).toBe("custom-leave");
    expect(tiProps.leaveFrom).toBe("custom-lfrom");
    expect(tiProps.leaveTo).toBe("custom-lto");
  });

  it("passes style transition config to TransitionItem children", () => {
    const config = makeConfig({
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
      enterTransition: "opacity 300ms ease",
      leaveStyle: { opacity: 1 },
      leaveToStyle: { opacity: 0 },
      leaveTransition: "opacity 200ms ease-in",
    });
    const children = [makeChild("a", "Alpha")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>;

    expect(tiProps.enterStyle).toEqual({ opacity: 0 });
    expect(tiProps.enterToStyle).toEqual({ opacity: 1 });
    expect(tiProps.enterTransition).toBe("opacity 300ms ease");
    expect(tiProps.leaveStyle).toEqual({ opacity: 1 });
    expect(tiProps.leaveToStyle).toEqual({ opacity: 0 });
    expect(tiProps.leaveTransition).toBe("opacity 200ms ease-in");
  });

  it("adjusts timeout per child based on stagger delay", () => {
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      timeout: 1000,
      interval: 100,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    // timeout = effectiveTimeout + delay, where delay = staggerIndex * interval
    for (let i = 0; i < wrapperChildren.length; i++) {
      const tiProps = wrapperChildren[i]?.props as Record<string, unknown>;
      const expectedTimeout = 1000 + i * 100;
      expect(tiProps.timeout).toBe(expectedTimeout);
    }
  });

  it("only fires onAfterLeave on the last child (normal order)", () => {
    const onAfterLeave = vi.fn();
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: { onAfterLeave },
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    // onAfterLeave should only be on the last child (index=2)
    for (let i = 0; i < wrapperChildren.length; i++) {
      const tiProps = wrapperChildren[i]?.props as Record<string, unknown>;
      if (i === 2) {
        expect(tiProps.onAfterLeave).toBeDefined();
      } else {
        expect(tiProps.onAfterLeave).toBeUndefined();
      }
    }
  });

  it("fires onAfterLeave on the first child when reverseLeave is true", () => {
    const onAfterLeave = vi.fn();
    const config = makeConfig();
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta"), makeChild("c", "Charlie")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => false,
      reverseLeave: true,
      callbacks: { onAfterLeave },
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];

    // With reverseLeave, onAfterLeave should be on the first child (index=0)
    for (let i = 0; i < wrapperChildren.length; i++) {
      const tiProps = wrapperChildren[i]?.props as Record<string, unknown>;
      if (i === 0) {
        expect(tiProps.onAfterLeave).toBeDefined();
      } else {
        expect(tiProps.onAfterLeave).toBeUndefined();
      }
    }
  });

  it("uses config.interval when interval prop is not provided", () => {
    const config = makeConfig({ interval: 200 });
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];
    const clonedChild = extractStaggerChild(wrapperChildren[1] as VNode);
    const childProps = clonedChild?.props as Record<string, unknown>;
    const style = childProps?.style as Record<string, unknown>;

    expect(style?.transitionDelay).toBe("200ms");
    expect(style?.["--stagger-interval"]).toBe("200ms");
  });

  it("interval prop overrides config.interval", () => {
    const config = makeConfig({ interval: 200 });
    const children = [makeChild("a", "Alpha"), makeChild("b", "Beta")];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 300,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];
    const clonedChild = extractStaggerChild(wrapperChildren[1] as VNode);
    const childProps = clonedChild?.props as Record<string, unknown>;
    const style = childProps?.style as Record<string, unknown>;

    expect(style?.transitionDelay).toBe("300ms");
    expect(style?.["--stagger-interval"]).toBe("300ms");
  });

  it("preserves existing style on child when injecting stagger styles", () => {
    const config = makeConfig();
    const childWithStyle: VNode = {
      type: "span",
      props: { style: { color: "red", fontWeight: "bold" } },
      children: ["Styled"],
      key: "styled",
    };

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 50,
      callbacks: {},
      children: [childWithStyle],
    });

    const wrapperChildren = vnode?.children as VNode[];
    const clonedChild = extractStaggerChild(wrapperChildren[0] as VNode);
    const childProps = clonedChild?.props as Record<string, unknown>;
    const style = childProps?.style as Record<string, unknown>;

    // Original styles preserved
    expect(style?.color).toBe("red");
    expect(style?.fontWeight).toBe("bold");
    // Stagger styles injected
    expect(style?.["--stagger-index"]).toBe(0);
    expect(style?.["--stagger-interval"]).toBe("50ms");
    expect(style?.transitionDelay).toBe("0ms");
  });

  it("filters out non-VNode children", () => {
    const config = makeConfig();
    const validChild = makeChild("a", "Alpha");
    // Simulate non-VNode values in children array
    const children = [validChild, null as unknown as VNode, undefined as unknown as VNode];

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    });

    const wrapperChildren = vnode?.children as VNode[];
    expect(wrapperChildren.length).toBe(1);
  });
});
