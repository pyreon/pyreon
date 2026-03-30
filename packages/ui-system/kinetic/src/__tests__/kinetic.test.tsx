import type { VNode, VNodeChild } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";

let _reducedMotion = false;

vi.mock("../useReducedMotion", () => ({
  useReducedMotion: () => () => _reducedMotion,
}));

import { kinetic } from "../index";
import { fade, slideUp } from "../presets";

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

const flushRaf = () => {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) cb();
};

const fireTransitionEnd = (el: HTMLElement) => {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "target", { value: el });
  el.dispatchEvent(event);
};

/**
 * Wire up a mock element to the ref found in the VNode tree.
 * The kinetic transition mode uses h(tag, { ref: mergedRef, ... })
 * which means the ref is directly on the VNode props.
 */
const wireRef = (vnode: VNode | null, el: HTMLElement) => {
  if (!vnode) return;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
  const visitNode = (node: VNode) => {
    const props = node.props as Record<string, unknown>;
    if (typeof props?.ref === "function") {
      (props.ref as (element: HTMLElement | null) => void)(el);
    } else if (props?.ref && typeof props.ref === "object") {
      (props.ref as { current: HTMLElement | null }).current = el;
    }

    // Visit vnode.children (for intrinsic elements)
    if (node.children) {
      const children = Array.isArray(node.children) ? node.children : [node.children];
      for (const child of children) {
        if (child && typeof child === "object" && "type" in (child as object)) {
          visitNode(child as VNode);
        }
      }
    }

    // Visit props.children (for component VNodes like Show)
    if (props?.children) {
      const pChildren = Array.isArray(props.children) ? props.children : [props.children];
      for (const child of pChildren) {
        if (child && typeof child === "object" && "type" in (child as object)) {
          visitNode(child as VNode);
        }
      }
    }

    // Visit fallback on Show
    if (
      props?.fallback &&
      typeof props.fallback === "object" &&
      "type" in (props.fallback as object)
    ) {
      visitNode(props.fallback as VNode);
    }
  };

  visitNode(vnode);
};

/**
 * Resolve the outermost component-type VNode by calling the function.
 * kinetic() returns VNodes where type is a component function (e.g. TransitionRenderer).
 * We call it once to execute the component and set up watches/refs,
 * but do NOT recurse into framework components like Show.
 */
const resolveComponent = (vnode: VNodeChild): VNode | null => {
  if (!vnode || typeof vnode !== "object" || !("type" in vnode)) return null;
  if (typeof vnode.type === "function") {
    const props = vnode.props as Record<string, unknown>;
    const children = vnode.children;
    // Call the component function with props (children merged in)
    const result = (vnode.type as (p: Record<string, unknown>) => VNodeChild)({
      ...props,
      ...(children != null ? { children } : {}),
    });
    if (!result || typeof result !== "object" || !("type" in result)) return null;
    return result;
  }
  return vnode;
};

// ─── Transition Mode (default) ────────────────────────────

describe("kinetic() — transition mode", () => {
  it("returns a VNode when show=true", () => {
    const FadeDiv = kinetic("div").preset(fade);
    const show = signal(true);
    const vnode = FadeDiv({ show, children: "Hello" });
    expect(vnode).not.toBeNull();
  });

  it("fires onEnter callback when entering", () => {
    const onEnter = vi.fn();
    const show = signal(false);
    const Slide = kinetic("div")
      .enter({ opacity: 0, transform: "translateY(16px)" })
      .enterTo({ opacity: 1, transform: "translateY(0)" })
      .enterTransition("all 300ms ease");

    const el = document.createElement("div");
    const vnode = resolveComponent(Slide({ show, onEnter, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("applies enterStyle on entering", () => {
    const show = signal(false);
    const Slide = kinetic("div")
      .enter({ opacity: 0, transform: "translateY(16px)" })
      .enterTo({ opacity: 1, transform: "translateY(0)" })
      .enterTransition("all 300ms ease");

    const el = document.createElement("div");
    const vnode = resolveComponent(Slide({ show, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    expect(el.style.opacity).toBe("0");
    expect(el.style.transition).toBe("all 300ms ease");

    flushRaf();
    flushRaf();

    expect(el.style.opacity).toBe("1");
  });

  it("applies class-based transitions via .enterClass()", () => {
    const show = signal(false);
    const ClassFade = kinetic("div")
      .enterClass({ active: "t-enter", from: "t-from", to: "t-to" })
      .leaveClass({ active: "t-leave", from: "t-lfrom", to: "t-lto" });

    const el = document.createElement("div");
    const vnode = resolveComponent(ClassFade({ show, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    expect(el.classList.contains("t-enter")).toBe(true);
    expect(el.classList.contains("t-from")).toBe(true);

    flushRaf();
    flushRaf();

    expect(el.classList.contains("t-from")).toBe(false);
    expect(el.classList.contains("t-to")).toBe(true);
  });

  it("fires lifecycle callbacks at correct times", () => {
    const onEnter = vi.fn();
    const onAfterEnter = vi.fn();
    const onLeave = vi.fn();
    const onAfterLeave = vi.fn();
    const show = signal(false);

    const FadeDiv = kinetic("div").preset(fade);
    const el = document.createElement("div");
    const vnode = resolveComponent(
      FadeDiv({ show, onEnter, onAfterEnter, onLeave, onAfterLeave, children: "Hello" }),
    );
    wireRef(vnode, el);

    // Enter
    show.set(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onAfterEnter).not.toHaveBeenCalled();

    flushRaf();
    flushRaf();
    fireTransitionEnd(el);

    expect(onAfterEnter).toHaveBeenCalledTimes(1);

    // Leave
    show.set(false);
    expect(onLeave).toHaveBeenCalledTimes(1);

    flushRaf();
    flushRaf();
    fireTransitionEnd(el);

    expect(onAfterLeave).toHaveBeenCalledTimes(1);
  });

  it("timeout fallback completes transition", () => {
    const onAfterEnter = vi.fn();
    const show = signal(false);
    const FadeDiv = kinetic("div").preset(fade).config({ timeout: 1000 });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, onAfterEnter, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    flushRaf();
    flushRaf();

    vi.advanceTimersByTime(1000);

    expect(onAfterEnter).toHaveBeenCalledTimes(1);
  });

  it("appear=true animates on initial mount", () => {
    const onEnter = vi.fn();
    const show = signal(true);
    const FadeDiv = kinetic("div").preset(fade).config({ appear: true }).on({ onEnter });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, children: "Hello" }));
    wireRef(vnode, el);

    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

// ─── Chain Immutability ────────────────────────────────────

describe("kinetic() — chaining", () => {
  it("chain is immutable (each method returns new component)", () => {
    const Base = kinetic("div");
    const WithFade = Base.preset(fade);
    const WithSlide = Base.preset(slideUp);

    // WithFade and WithSlide are different components
    expect(WithFade).not.toBe(WithSlide);
    expect(WithFade).not.toBe(Base);
  });

  it(".preset() merges preset properties into config", () => {
    const show = signal(false);
    const FadeDiv = kinetic("div").preset(fade);

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    expect(el.style.opacity).toBe("0");
    expect(el.style.transition).toBe("opacity 300ms ease-out");
  });

  it(".on() callbacks from chain are used when runtime callbacks not provided", () => {
    const onEnter = vi.fn();
    const show = signal(false);
    const FadeDiv = kinetic("div").preset(fade).on({ onEnter });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("runtime props override chain config", () => {
    const chainOnEnter = vi.fn();
    const runtimeOnEnter = vi.fn();
    const show = signal(false);
    const FadeDiv = kinetic("div").preset(fade).on({ onEnter: chainOnEnter });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, onEnter: runtimeOnEnter, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    expect(runtimeOnEnter).toHaveBeenCalledTimes(1);
    expect(chainOnEnter).not.toHaveBeenCalled();
  });

  it("displayName is set correctly", () => {
    const FadeDiv = kinetic("div").preset(fade);
    expect(FadeDiv.displayName).toBe("kinetic(div)");
  });
});

// ─── Collapse Mode ─────────────────────────────────────────

describe("kinetic() — collapse mode", () => {
  const mockScrollHeight = (value: number) => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return value;
      },
    });
  };

  beforeEach(() => {
    mockScrollHeight(200);
  });

  it("fires onEnter on entering and onAfterEnter after transitionend", () => {
    const onEnter = vi.fn();
    const onAfterEnter = vi.fn();
    const show = signal(false);
    const Accordion = kinetic("div").collapse();

    const wrapperEl = document.createElement("div");
    const contentEl = document.createElement("div");
    Object.defineProperty(wrapperEl, "offsetHeight", {
      configurable: true,
      get: () => 0,
    });

    const vnode = resolveComponent(
      Accordion({
        show,
        onEnter,
        onAfterEnter,
        children: { type: "p", props: {}, children: ["Content"], key: null },
      }),
    );

    // Wire up refs - CollapseRenderer uses h(config.tag, { ref: wrapperRef, ... })
    // and inner <div ref={contentRef}>
    wireRef(vnode, wrapperEl);

    // Find contentRef in the VNode tree
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
    const findContentRef = (node: VNode | null) => {
      if (!node) return;
      if (node.children) {
        const children = Array.isArray(node.children) ? node.children : [node.children];
        for (const child of children) {
          if (child && typeof child === "object" && "type" in (child as object)) {
            const cNode = child as VNode;
            const props = cNode.props as Record<string, unknown>;
            if (props?.ref && typeof props.ref === "object" && cNode.type === "div") {
              (props.ref as { current: HTMLElement | null }).current = contentEl;
            }
            findContentRef(cNode);
          }
        }
      }
      // Check Show props
      const props = node.props as Record<string, unknown>;
      if (props?.children) {
        const pc = Array.isArray(props.children) ? props.children : [props.children];
        for (const p of pc) {
          if (p && typeof p === "object" && "type" in (p as object)) {
            const pNode = p as VNode;
            const pProps = pNode.props as Record<string, unknown>;
            if (pProps?.ref && typeof pProps.ref === "object") {
              (pProps.ref as { current: HTMLElement | null }).current = contentEl;
            }
          }
        }
      }
    };
    findContentRef(vnode);

    show.set(true);

    expect(onEnter).toHaveBeenCalledTimes(1);

    fireTransitionEnd(wrapperEl);

    expect(onAfterEnter).toHaveBeenCalledTimes(1);
  });
});

// ─── Transition mode — leave with styles ─────────────────────

describe("kinetic() — transition leave styles", () => {
  it("applies leaveStyle and leaveTransition on leaving", () => {
    const show = signal(true);
    const Slide = kinetic("div")
      .enter({ opacity: 0 })
      .enterTo({ opacity: 1 })
      .enterTransition("opacity 300ms ease")
      .leave({ opacity: 1 })
      .leaveTo({ opacity: 0 })
      .leaveTransition("opacity 200ms ease-in");

    const el = document.createElement("div");
    const vnode = resolveComponent(Slide({ show, children: "Hello" }));
    wireRef(vnode, el);

    show.set(false);

    expect(el.style.opacity).toBe("1");
    expect(el.style.transition).toBe("opacity 200ms ease-in");

    flushRaf();
    flushRaf();

    expect(el.style.opacity).toBe("0");
  });
});

// ─── Config defaults ──────────────────────────────────────

describe("kinetic() — config defaults and overrides", () => {
  it("appear from config is used when runtime appear not provided", () => {
    const onEnter = vi.fn();
    const show = signal(true);
    const FadeDiv = kinetic("div").preset(fade).config({ appear: true });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, onEnter, children: "Hello" }));
    wireRef(vnode, el);

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("runtime appear overrides config appear", () => {
    const onEnter = vi.fn();
    const show = signal(true);
    const FadeDiv = kinetic("div").preset(fade).config({ appear: true });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, appear: false, onEnter, children: "Hello" }));
    wireRef(vnode, el);

    expect(onEnter).not.toHaveBeenCalled();
  });

  it("timeout from config is used as fallback", () => {
    const onAfterEnter = vi.fn();
    const show = signal(false);
    const FadeDiv = kinetic("div").preset(fade).config({ timeout: 200 });

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, onAfterEnter, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    flushRaf();
    flushRaf();

    // No transitionend fired — timeout from config (200ms) should fire
    vi.advanceTimersByTime(200);

    expect(onAfterEnter).toHaveBeenCalledTimes(1);
  });

  it("runtime timeout overrides config timeout", () => {
    const onAfterEnter = vi.fn();
    const show = signal(false);
    const FadeDiv = kinetic("div").preset(fade).config({ timeout: 200 });

    const el = document.createElement("div");
    const vnode = resolveComponent(
      FadeDiv({ show, timeout: 500, onAfterEnter, children: "Hello" }),
    );
    wireRef(vnode, el);

    show.set(true);

    flushRaf();
    flushRaf();

    // 200ms from config should NOT trigger since runtime is 500ms
    vi.advanceTimersByTime(200);
    expect(onAfterEnter).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onAfterEnter).toHaveBeenCalledTimes(1);
  });
});

// ─── DisplayName ───────────────────────────────────────────

describe("kinetic() — displayName", () => {
  it("uses tag string for displayName", () => {
    const FadeDiv = kinetic("div").preset(fade);
    expect(FadeDiv.displayName).toBe("kinetic(div)");
  });
});

// ─── Reduced Motion ───────────────────────────────────────

describe("kinetic() — transition reduced motion", () => {
  beforeEach(() => {
    _reducedMotion = true;
  });

  afterEach(() => {
    _reducedMotion = false;
  });

  it("reduced motion: entering fires onEnter and onAfterEnter immediately without rAF", () => {
    const show = signal(false);
    const onEnter = vi.fn();
    const onAfterEnter = vi.fn();
    const FadeDiv = kinetic("div").preset(fade);

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, onEnter, onAfterEnter, children: "Hello" }));
    wireRef(vnode, el);

    show.set(true);

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onAfterEnter).toHaveBeenCalledTimes(1);
    // No rAF should have been used
    expect(rafCallbacks.length).toBe(0);
  });

  it("reduced motion: leaving fires onLeave and onAfterLeave immediately without rAF", () => {
    const show = signal(true);
    const onLeave = vi.fn();
    const onAfterLeave = vi.fn();
    const FadeDiv = kinetic("div").preset(fade);

    const el = document.createElement("div");
    const vnode = resolveComponent(FadeDiv({ show, onLeave, onAfterLeave, children: "Hello" }));
    wireRef(vnode, el);

    show.set(false);

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onAfterLeave).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.length).toBe(0);
  });
});
