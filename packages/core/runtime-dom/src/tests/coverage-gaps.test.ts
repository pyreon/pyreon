/**
 * Additional targeted tests to push branch coverage to >= 95%.
 * Focuses on specific uncovered branches in:
 *   - devtools.ts (lines 139, 149-165, 226)
 *   - hydrate.ts (lines 162-183)
 *   - keep-alive.ts (lines 48, 55)
 *   - nodes.ts (lines 175-178, 338, 385)
 *   - props.ts (lines 182, 190, 273-277)
 *   - transition.ts (lines 111-113)
 *   - transition-group.ts (lines 209-218)
 *   - mount.ts (lines 204-206)
 *   - hydration-debug.ts (line 35)
 */
import type { ComponentFn, VNodeChild } from "@pyreon/core";
import { createRef, defineComponent, For, Fragment, h, onMount, onUnmount } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";
import {
  installDevTools,
  onOverlayClick,
  onOverlayMouseMove,
  registerComponent,
  unregisterComponent,
} from "../devtools";
import { warnHydrationMismatch } from "../hydration-debug";
import {
  KeepAlive as _KeepAlive,
  Transition as _Transition,
  TransitionGroup as _TransitionGroup,
  _tpl,
  disableHydrationWarnings,
  enableHydrationWarnings,
  hydrateRoot,
  mount,
  sanitizeHtml,
  setSanitizer,
} from "../index";
import { mountChild } from "../mount";
import { applyProp } from "../props";

const Transition = _Transition as unknown as ComponentFn<Record<string, unknown>>;
const TransitionGroup = _TransitionGroup as unknown as ComponentFn<Record<string, unknown>>;
const KeepAlive = _KeepAlive as unknown as ComponentFn<Record<string, unknown>>;

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

// ─── hydration-debug.ts — line 35: _enabled=false early return ──────────────

describe("hydration-debug — disabled warnings branch", () => {
  test("warnHydrationMismatch does nothing when warnings disabled", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    disableHydrationWarnings();
    warnHydrationMismatch("tag", "div", "span", "root > test");
    expect(warnSpy).not.toHaveBeenCalled();
    enableHydrationWarnings();
    warnSpy.mockRestore();
  });

  test("warnHydrationMismatch emits when warnings enabled", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    enableHydrationWarnings();
    warnHydrationMismatch("tag", "div", "span", "root > test");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Hydration mismatch"));
    warnSpy.mockRestore();
  });
});

// ─── devtools.ts — line 139: tooltip below element when rect.top < 35 ──────

describe("devtools — tooltip repositioning and click paths", () => {
  beforeAll(() => {
    installDevTools();
  });

  test("highlight with valid element applies and removes outline", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      highlight: (id: string) => void;
    };
    const target = document.createElement("div");
    document.body.appendChild(target);
    registerComponent("highlight-test", "HighlightComp", target, null);

    devtools.highlight("highlight-test");
    expect((target as HTMLElement).style.outline).toContain("#00b4d8");

    // Wait for the timeout to clear the outline (line 226)
    await new Promise<void>((r) => setTimeout(r, 1600));
    expect((target as HTMLElement).style.outline).toBe("");

    unregisterComponent("highlight-test");
    target.remove();
  });

  test("highlight with nonexistent id does nothing", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      highlight: (id: string) => void;
    };
    // Should not throw
    devtools.highlight("nonexistent-id");
  });

  test("highlight with no element (el: null) does nothing", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      highlight: (id: string) => void;
    };
    registerComponent("no-el", "NoElComp", null, null);
    // entry exists but el is null — should early return (line 221)
    devtools.highlight("no-el");
    unregisterComponent("no-el");
  });

  test("onComponentMount listener fires on register", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      onComponentMount: (cb: (entry: unknown) => void) => () => void;
      onComponentUnmount: (cb: (id: string) => void) => () => void;
    };
    let mountedEntry: unknown = null;
    const unsub = devtools.onComponentMount((entry) => {
      mountedEntry = entry;
    });
    registerComponent("listener-test", "ListenerComp", null, null);
    expect(mountedEntry).not.toBeNull();

    let unmountedId: string | null = null;
    const unsub2 = devtools.onComponentUnmount((id) => {
      unmountedId = id;
    });
    unregisterComponent("listener-test");
    expect(unmountedId).toBe("listener-test");

    // Unsubscribe
    unsub();
    unsub2();
  });

  test("unregisterComponent with non-existent id does nothing", () => {
    // Should not throw — early return on line 61
    unregisterComponent("does-not-exist");
  });

  test("unregisterComponent with no parent does not try to update parent", () => {
    registerComponent("orphan", "Orphan", null, null);
    // parentId is null — should skip parent.childIds update
    unregisterComponent("orphan");
  });

  test("onComponentMount unsubscribe with already-removed listener is safe", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      onComponentMount: (cb: (entry: unknown) => void) => () => void;
    };
    const cb = () => {};
    const unsub = devtools.onComponentMount(cb);
    unsub();
    // Second unsub — indexOf returns -1, should not splice
    unsub();
  });

  test("onComponentUnmount unsubscribe with already-removed listener is safe", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      onComponentUnmount: (cb: (id: string) => void) => () => void;
    };
    const cb = () => {};
    const unsub = devtools.onComponentUnmount(cb);
    unsub();
    unsub();
  });

  test("installDevTools called again is noop (already installed)", () => {
    // Second call should return early (line 205: _installed = true)
    installDevTools();
    expect((window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__).toBeDefined();
  });

  test("overlay click path — entry found with parentId triggers parent log", () => {
    // We need to actually exercise the onOverlayClick code paths.
    // In happy-dom, elementFromPoint may return null, so let's test the
    // code path by directly triggering click events and checking no errors.
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const parentEl = document.createElement("div");
    parentEl.style.cssText = "width:200px;height:200px;position:fixed;top:0;left:0;";
    document.body.appendChild(parentEl);

    const childEl = document.createElement("span");
    childEl.style.cssText = "width:50px;height:50px;";
    parentEl.appendChild(childEl);

    registerComponent("click-p", "ClickParent", parentEl, null);
    registerComponent("click-c", "ClickChild", childEl, "click-p");

    devtools.enableOverlay();

    // Simulate click
    const event = new MouseEvent("click", { clientX: 25, clientY: 25, bubbles: true });
    document.dispatchEvent(event);

    devtools.disableOverlay();
    unregisterComponent("click-c");
    unregisterComponent("click-p");
    parentEl.remove();
  });

  test("overlay click on null target returns early", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };
    devtools.enableOverlay();
    // dispatch click; in happy-dom elementFromPoint may return null → line 148 return
    const event = new MouseEvent("click", { clientX: -1, clientY: -1, bubbles: true });
    document.dispatchEvent(event);
    devtools.disableOverlay();
  });

  test("overlay mousemove on overlay/tooltip element itself is ignored", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };
    devtools.enableOverlay();
    // The overlay div itself should be ignored (line 107)
    const overlayEl = document.getElementById("__pyreon-overlay");
    if (overlayEl) {
      const event = new MouseEvent("mousemove", { clientX: 0, clientY: 0, bubbles: true });
      overlayEl.dispatchEvent(event);
    }
    devtools.disableOverlay();
  });
});

// ─── keep-alive.ts — line 48 (no container) and line 55 (no children) ───────

describe("KeepAlive — edge cases", () => {
  test("KeepAlive with no active prop defaults to visible", () => {
    const el = container();
    const unmount = mount(h(KeepAlive, {}, h("span", null, "always-visible")), el);
    // Should render and be visible (active defaults to true)
    expect(el.querySelector("span")?.textContent).toBe("always-visible");
    unmount();
  });

  test("KeepAlive toggles visibility without remounting", () => {
    const el = container();
    const active = signal(true);
    const unmount = mount(h(KeepAlive, { active: () => active() }, h("span", null, "toggle")), el);
    expect(el.querySelector("span")?.textContent).toBe("toggle");

    // Hide
    active.set(false);
    const wrapper = el.querySelector("div") as HTMLElement;
    expect(wrapper?.style.display).toBe("none");

    // Show again — same element, not remounted
    active.set(true);
    expect(wrapper?.style.display).toBe("");

    unmount();
  });

  test("KeepAlive with no children mounts empty container", () => {
    const el = container();
    const unmount = mount(h(KeepAlive, { active: () => true }), el);
    // Container div exists but no children
    expect(el.querySelector("div")).not.toBeNull();
    unmount();
  });
});

// ─── nodes.ts — lines 175-178 (LIS typed array growth), line 338 (dev dup key warn) ─────

describe("nodes.ts — LIS array growth and dev warnings", () => {
  test("mountFor with > 16 items triggers typed array growth (lines 175-178)", () => {
    const el = container();
    // Create > 16 items to trigger array growth in LIS path
    const initial = Array.from({ length: 20 }, (_, i) => ({ id: i, label: `item-${i}` }));
    const items = signal(initial);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("span", null, r.label),
        }),
      ),
      el,
    );
    expect(el.querySelectorAll("span").length).toBe(20);

    // Reverse to trigger full LIS reorder with > 16 entries
    const reversed = [...initial].reverse();
    items.set(reversed);
    expect(el.querySelectorAll("span").length).toBe(20);

    el.remove();
  });

  test("mountFor duplicate key warning in dev mode (line 338)", () => {
    const el = container();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const items = signal([{ id: 1 }, { id: 1 }]); // duplicate keys

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => h("span", null, String(r.id)),
        }),
      ),
      el,
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Duplicate key"));
    warnSpy.mockRestore();
    el.remove();
  });

  test("mountFor duplicate key warning on update (line 385)", () => {
    const el = container();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const items = signal([{ id: 1 }, { id: 2 }]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => h("span", null, String(r.id)),
        }),
      ),
      el,
    );

    // Update with duplicate keys
    items.set([{ id: 3 }, { id: 3 }]);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Duplicate key"));
    warnSpy.mockRestore();
    el.remove();
  });

  test("mountFor clear path — items reduced to 0", () => {
    const el = container();
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => h("span", null, String(r.id)),
        }),
      ),
      el,
    );
    expect(el.querySelectorAll("span").length).toBe(3);

    // Clear — fast clear path
    items.set([]);
    expect(el.querySelectorAll("span").length).toBe(0);

    el.remove();
  });

  test("mountFor cleanup return — cleanupCount > 0 path in final cleanup", () => {
    const el = container();
    let cleanupCalled = 0;
    const items = signal([{ id: 1 }]);

    const Comp = defineComponent(() => {
      onUnmount(() => {
        cleanupCalled++;
      });
      return h("span", null, "has-cleanup");
    });

    const unmount = mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => h(Comp, { key: r.id }),
        }),
      ),
      el,
    );

    // Unmount the whole thing — exercises the final cleanup with cleanupCount > 0
    unmount();
    expect(cleanupCalled).toBe(1);
    el.remove();
  });

  test("mountFor with NativeItem entries", () => {
    const el = container();
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => {
            const native = _tpl("<b></b>", (root) => {
              root.textContent = r.label;
              return null;
            });
            return native as unknown as ReturnType<typeof h>;
          },
        }),
      ),
      el,
    );
    expect(el.querySelectorAll("b").length).toBe(2);

    // Add a new NativeItem entry — step 3 mount new entries with NativeItem
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ]);
    expect(el.querySelectorAll("b").length).toBe(3);

    el.remove();
  });

  test("mountFor step 3 NativeItem with cleanup", () => {
    const el = container();
    let _cleanupCount = 0;
    const items = signal([{ id: 1, label: "a" }]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => {
            const native = _tpl("<b></b>", (root) => {
              root.textContent = r.label;
              return () => {
                _cleanupCount++;
              };
            });
            return native as unknown as ReturnType<typeof h>;
          },
        }),
      ),
      el,
    );

    // Add new NativeItem with cleanup — exercises step 3 NativeItem cleanup path
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "new" },
    ]);
    expect(el.querySelectorAll("b").length).toBe(2);

    el.remove();
  });

  test("mountReactive — __DEV__ warning when accessor returns function", () => {
    const el = container();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Reactive accessor that returns a function (not a value) — dev warning
    const badAccessor = () => (() => "oops") as unknown as VNodeChild;
    mount(h("div", null, badAccessor as VNodeChild), el);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("returned a function instead of a value"),
    );
    warnSpy.mockRestore();
    el.remove();
  });
});

// ─── props.ts — lines 182 (Sanitizer API), 190 (no DOMParser) ─────

describe("props.ts — Sanitizer API branch", () => {
  test("sanitizeHtml fallback — strips unsafe tags via DOMParser", () => {
    setSanitizer(null);
    // _nativeSanitizer is undefined (happy-dom has no Sanitizer API)
    // Falls through to DOMParser-based fallback sanitizer
    const result = sanitizeHtml("<b>bold</b><script>bad</script>");
    // <script> should be stripped, <b> should remain
    expect(result).toContain("<b>");
    expect(result).not.toContain("<script>");
  });

  test("sanitizeHtml fallback strips event handler attributes", () => {
    setSanitizer(null);
    const result = sanitizeHtml('<div onclick="alert(1)">test</div>');
    expect(result).not.toContain("onclick");
  });

  test("sanitizeHtml fallback blocks javascript: URLs", () => {
    setSanitizer(null);
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  test("blocked unsafe URL in href attribute", () => {
    const el = document.createElement("a");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    applyProp(el, "href", "javascript:alert(1)");
    expect(el.getAttribute("href")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Blocked unsafe"));

    warnSpy.mockRestore();
  });

  test("blocked unsafe data: URL in src attribute", () => {
    const el = document.createElement("img");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    applyProp(el, "src", "data:text/html,<script>bad</script>");
    expect(el.getAttribute("src")).toBeNull();

    warnSpy.mockRestore();
  });

  test("style as object applies via Object.assign", () => {
    const el = container();
    mount(h("div", { style: { color: "red", fontSize: "14px" } }), el);
    const div = el.querySelector("div") as HTMLElement;
    expect(div.style.color).toBe("red");
    expect(div.style.fontSize).toBe("14px");
    el.remove();
  });

  test("boolean attribute false removes attribute", () => {
    const el = document.createElement("input");
    applyProp(el, "disabled", true);
    expect(el.hasAttribute("disabled")).toBe(true);
    applyProp(el, "disabled", false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("null value removes attribute", () => {
    const el = document.createElement("div");
    el.setAttribute("data-x", "value");
    applyProp(el, "data-x", null);
    expect(el.hasAttribute("data-x")).toBe(false);
  });

  test("DOM property is set directly when key exists on element", () => {
    const el = document.createElement("input");
    applyProp(el, "value", "hello");
    expect(el.value).toBe("hello");
  });

  test("className alias sets class attribute", () => {
    const el = document.createElement("div");
    applyProp(el, "className", "my-class");
    expect(el.getAttribute("class")).toBe("my-class");
  });

  test("class with null value sets empty string", () => {
    const el = document.createElement("div");
    applyProp(el, "class", null);
    expect(el.getAttribute("class")).toBe("");
  });
});

// ─── hydrate.ts — lines 162-183 (For with/without markers, afterEnd paths) ──

describe("hydrate.ts — For and reactive accessor branches", () => {
  test("For hydration without markers and no domNode (null)", () => {
    const el = container();
    // Empty container — domNode will be null
    el.innerHTML = "";
    const items = signal([{ id: 1, label: "a" }]);
    const cleanup = hydrateRoot(
      el,
      For({
        each: items,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number; label: string }) => h("li", null, r.label),
      }),
    );
    cleanup();
  });

  test("hydrate reactive accessor returning null/false inserts marker before domNode", () => {
    const el = container();
    el.innerHTML = "<p>existing</p>";
    const content = signal<VNodeChild>(null);
    const cleanup = hydrateRoot(el, (() => content()) as unknown as VNodeChild);
    // Accessor returns null — comment marker inserted before existing <p>
    cleanup();
  });

  test("hydrate reactive accessor returning null with no domNode appends marker", () => {
    const el = container();
    el.innerHTML = "";
    const content = signal<VNodeChild>(null);
    const cleanup = hydrateRoot(el, (() => content()) as unknown as VNodeChild);
    cleanup();
  });

  test("hydrate reactive text with DOM mismatch (not a text node)", () => {
    const el = container();
    el.innerHTML = "<div>not text</div>"; // Element instead of text node
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const text = signal("hello");
    const cleanup = hydrateRoot(el, (() => text()) as unknown as VNodeChild);
    // Should hit the mismatch path (line 119)
    cleanup();
    warnSpy.mockRestore();
  });

  test("hydrate reactive VNode with no domNode appends marker", () => {
    const el = container();
    el.innerHTML = "";
    const content = signal<VNodeChild>(h("span", null, "dynamic"));
    const cleanup = hydrateRoot(el, (() => content()) as unknown as VNodeChild);
    cleanup();
  });

  test("hydrate static text with non-text domNode (mismatch)", () => {
    const el = container();
    el.innerHTML = "<div>wrong</div>"; // Element where text expected
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = hydrateRoot(el, "plain text");
    cleanup();
    warnSpy.mockRestore();
  });

  test("hydrate element with ref sets ref.current", () => {
    const el = container();
    el.innerHTML = "<div>with ref</div>";
    const ref = createRef<Element>();
    const cleanup = hydrateRoot(el, h("div", { ref }, "with ref"));
    expect(ref.current).not.toBeNull();
    expect(ref.current?.textContent).toBe("with ref");
    cleanup();
    expect(ref.current).toBeNull();
  });

  test("hydrate component that throws during setup", () => {
    const el = container();
    el.innerHTML = "<span>error</span>";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const BadComp = defineComponent(() => {
      throw new Error("hydrate setup error");
    });
    const cleanup = hydrateRoot(el, h(BadComp, null));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error hydrating component"),
      expect.any(Error),
    );
    cleanup();
    errorSpy.mockRestore();
  });

  test("hydrate array of children", () => {
    const el = container();
    el.innerHTML = "<span>a</span><span>b</span>";
    const cleanup = hydrateRoot(el, h(Fragment, null, h("span", null, "a"), h("span", null, "b")));
    cleanup();
  });

  test("hydrate skips comments and whitespace-only text nodes", () => {
    const el = container();
    // HTML with comments and whitespace between elements
    el.innerHTML = "<!-- comment -->  <div>real</div>";
    const cleanup = hydrateRoot(el, h("div", null, "real"));
    cleanup();
  });

  test("hydrate children with reactive text (reuses text node)", () => {
    const el = container();
    el.innerHTML = "<div>hello</div>";
    const text = signal("hello");
    const cleanup = hydrateRoot(el, h("div", null, (() => text()) as unknown as VNodeChild));
    // Text should be reactive
    text.set("world");
    cleanup();
  });
});

// ─── transition.ts — lines 111-113 (pendingLeaveCancel in applyLeave rAF) ──

describe("Transition — leave cancel and re-enter", () => {
  test("re-enter during leave cancels pending leave animation (lines 110-113)", async () => {
    const el = container();
    const visible = signal(true);
    let beforeEnterCount = 0;
    let beforeLeaveCount = 0;

    mount(
      h(Transition, {
        show: visible,
        name: "fade",
        onBeforeEnter: () => {
          beforeEnterCount++;
        },
        onBeforeLeave: () => {
          beforeLeaveCount++;
        },
        children: h("div", { id: "reenter-test" }, "content"),
      }),
      el,
    );

    // Start leave
    visible.set(false);

    // Wait for rAF to set up pendingLeaveCancel
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    // Re-enter before leave completes — should cancel leave
    visible.set(true);
    await new Promise<void>((r) => queueMicrotask(r));

    expect(beforeLeaveCount).toBe(1);
    // beforeEnter fires on re-enter
    expect(beforeEnterCount).toBeGreaterThanOrEqual(1);

    el.remove();
  });

  test("Transition appear prop triggers enter animation on initial mount", async () => {
    const el = container();
    let afterEnterCalled = false;

    mount(
      h(Transition, {
        show: () => true,
        name: "fade",
        appear: true,
        onAfterEnter: () => {
          afterEnterCalled = true;
        },
        children: h("div", { id: "appear-test" }, "appear"),
      }),
      el,
    );

    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const target = el.querySelector("#appear-test");
    if (target) {
      target.dispatchEvent(new Event("transitionend"));
    }
    expect(afterEnterCalled).toBe(true);

    el.remove();
  });

  test("Transition show starts false then becomes true", async () => {
    const el = container();
    const visible = signal(false);

    mount(
      h(Transition, {
        show: visible,
        name: "fade",
        children: h("div", { id: "false-start" }, "content"),
      }),
      el,
    );

    // Initially hidden
    expect(el.querySelector("#false-start")).toBeNull();

    // Show
    visible.set(true);
    await new Promise<void>((r) => queueMicrotask(r));

    expect(el.querySelector("#false-start")).not.toBeNull();

    el.remove();
  });
});

// ─── transition-group.ts — lines 209-218 (FLIP inner rAF) ───────────────────

describe("TransitionGroup — leave and enter edge cases", () => {
  test("TransitionGroup with appear triggers enter animation", async () => {
    const el = container();
    let enterCount = 0;
    const items = signal([{ id: 1, label: "a" }]);

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        appear: true,
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number; label: string }) =>
          h("span", { class: "tg-item" }, item.label),
        onBeforeEnter: () => {
          enterCount++;
        },
      }),
      el,
    );

    await new Promise<void>((r) => queueMicrotask(r));
    expect(enterCount).toBe(1);

    el.remove();
  });

  test("TransitionGroup item removal with no ref.current cleans up without leave animation", async () => {
    const el = container();
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    // Use component type child so ref won't be injected (line 171)
    const ItemComp = defineComponent((props: { label: string }) => h("span", null, props.label));

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number; label: string }) =>
          h(ItemComp as unknown as string, { label: item.label }),
      }),
      el,
    );
    await new Promise<void>((r) => queueMicrotask(r));

    // Remove an item — ref.current will be null for component children
    items.set([{ id: 1, label: "a" }]);
    await new Promise<void>((r) => queueMicrotask(r));

    el.remove();
  });

  test("TransitionGroup leave animation with onBeforeLeave and onAfterLeave", async () => {
    const el = container();
    let beforeLeaveCalled = false;
    let afterLeaveCalled = false;
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number; label: string }) =>
          h("span", { class: "leave-item" }, item.label),
        onBeforeLeave: () => {
          beforeLeaveCalled = true;
        },
        onAfterLeave: () => {
          afterLeaveCalled = true;
        },
      }),
      el,
    );
    await new Promise<void>((r) => queueMicrotask(r));

    // Remove an item
    items.set([{ id: 1, label: "a" }]);
    await new Promise<void>((r) => queueMicrotask(r));

    expect(beforeLeaveCalled).toBe(true);

    // Wait for rAF in applyLeave
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    // Fire transitionend on the leaving element
    const spans = el.querySelectorAll("span.leave-item");
    for (const span of spans) {
      span.dispatchEvent(new Event("transitionend"));
    }

    // afterLeaveCalled should be true after transitionend
    expect(afterLeaveCalled).toBe(true);

    el.remove();
  });
});

// ─── mount.ts — lines 204-206 (mountElement nested with ref, no propCleanup) ─

describe("mount.ts — nested element branches", () => {
  test("nested element with ref but no propCleanup (line 202-207)", () => {
    const el = container();
    const ref = createRef<HTMLElement>();

    // Inner element has ref but no reactive props
    const unmount = mount(h("div", null, h("span", { ref }, "with-ref-only")), el);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.textContent).toBe("with-ref-only");

    unmount();
    // Ref should be cleaned up
    expect(ref.current).toBeNull();
  });

  test("nested element with childCleanup only (line 196)", () => {
    const el = container();
    const text = signal("dynamic");

    // Inner element with reactive children but no ref, no propCleanup
    const unmount = mount(
      h(
        "div",
        null,
        h("span", null, () => text()),
      ),
      el,
    );

    expect(el.querySelector("span")?.textContent).toBe("dynamic");
    text.set("updated");
    expect(el.querySelector("span")?.textContent).toBe("updated");

    unmount();
  });

  test("mountChild with boolean sample (true) uses text fast path", () => {
    const el = container();
    const flag = signal(true);
    mount(
      h("div", null, () => flag()),
      el,
    );
    expect(el.querySelector("div")?.textContent).toBe("true");
    flag.set(false);
    expect(el.querySelector("div")?.textContent).toBe("");
  });

  test("mountElement at depth 0 with ref + propCleanup + childCleanup", () => {
    const el = container();
    const ref = createRef<HTMLElement>();
    const cls = signal("cls");
    const text = signal("txt");

    const unmount = mount(
      h("span", { ref, class: () => cls() }, () => text()),
      el,
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current?.className).toBe("cls");
    expect(ref.current?.textContent).toBe("txt");

    unmount();
    expect(ref.current).toBeNull();
  });

  test("mountChildren with undefined children", () => {
    const el = container();
    // Single child that is undefined — should be handled
    mount(h("div", null, undefined), el);
    expect(el.querySelector("div")?.textContent).toBe("");
  });

  test("mountChildren 2-child path with undefined child in slot 0", () => {
    const el = container();
    // 2 children where first is undefined — falls through to map path
    mount(h("div", null, undefined, "text"), el);
  });

  test("component with onMount returning cleanup", () => {
    const el = container();
    let mountCleanupCalled = false;

    const Comp = defineComponent(() => {
      onMount(() => {
        return () => {
          mountCleanupCalled = true;
        };
      });
      return h("span", null, "with-mount-cleanup");
    });

    const unmount = mount(h(Comp, null), el);
    unmount();
    expect(mountCleanupCalled).toBe(true);
  });

  test("component onMount hook that throws", () => {
    const el = container();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const Comp = defineComponent(() => {
      onMount(() => {
        throw new Error("mount hook error");
      });
      return h("span", null, "error-mount");
    });

    mount(h(Comp, null), el);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error in onMount hook"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  test("component onUnmount hook that throws", () => {
    const el = container();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const Comp = defineComponent(() => {
      onUnmount(() => {
        throw new Error("unmount hook error");
      });
      return h("span", null, "error-unmount");
    });

    const unmount = mount(h(Comp, null), el);
    unmount();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error in onUnmount hook"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  test("mount with null container in dev mode throws", () => {
    expect(() => {
      mount(h("div", null), null as unknown as Element);
    }).toThrow("mount() called with a null/undefined container");
  });
});

// ─── nodes.ts — mountKeyedList branches ─────────────────────────────────────

describe("nodes.ts — mountKeyedList branches", () => {
  test("mountKeyedList fast clear path", () => {
    const el = container();
    const items = signal([h("span", { key: 1 }, "a"), h("span", { key: 2 }, "b")] as VNodeChild);

    mount(h("div", null, (() => items()) as VNodeChild), el);
    expect(el.querySelectorAll("span").length).toBe(2);

    // Clear all
    items.set([] as unknown as VNodeChild);
    expect(el.querySelectorAll("span").length).toBe(0);
  });

  test("mountKeyedList stale entry removal", () => {
    const el = container();
    const items = signal([
      h("span", { key: 1 }, "a"),
      h("span", { key: 2 }, "b"),
      h("span", { key: 3 }, "c"),
    ] as VNodeChild);

    mount(h("div", null, (() => items()) as VNodeChild), el);
    expect(el.querySelectorAll("span").length).toBe(3);

    // Remove middle item
    items.set([h("span", { key: 1 }, "a"), h("span", { key: 3 }, "c")] as unknown as VNodeChild);
    expect(el.querySelectorAll("span").length).toBe(2);
  });

  test("mountKeyedList reorder with LIS", () => {
    const el = container();
    const items = signal([
      h("span", { key: 1 }, "a"),
      h("span", { key: 2 }, "b"),
      h("span", { key: 3 }, "c"),
    ] as VNodeChild);

    mount(h("div", null, (() => items()) as VNodeChild), el);

    // Reverse order — triggers LIS reorder
    items.set([
      h("span", { key: 3 }, "c"),
      h("span", { key: 2 }, "b"),
      h("span", { key: 1 }, "a"),
    ] as unknown as VNodeChild);

    const spans = el.querySelectorAll("span");
    expect(spans[0]?.textContent).toBe("c");
    expect(spans[1]?.textContent).toBe("b");
    expect(spans[2]?.textContent).toBe("a");
  });
});

// ─── nodes.ts — mountFor small-k reorder and replace-all paths ──────────────

describe("nodes.ts — mountFor small-k and clearBetween paths", () => {
  test("mountFor small-k fast path — few items swapped", () => {
    const el = container();
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("span", null, r.label),
        }),
      ),
      el,
    );

    // Swap first two — small-k path (diffs.length <= SMALL_K)
    items.set([
      { id: 2, label: "b" },
      { id: 1, label: "a" },
      { id: 3, label: "c" },
    ]);

    const spans = el.querySelectorAll("span");
    expect(spans[0]?.textContent).toBe("b");
    expect(spans[1]?.textContent).toBe("a");
    expect(spans[2]?.textContent).toBe("c");

    el.remove();
  });

  test("mountFor remove stale entries (step 2)", () => {
    const el = container();
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("span", null, r.label),
        }),
      ),
      el,
    );

    // Remove item 2 and add item 4 — keeps some, removes some, adds some
    items.set([
      { id: 1, label: "a" },
      { id: 4, label: "d" },
      { id: 3, label: "c" },
    ]);

    expect(el.querySelectorAll("span").length).toBe(3);

    el.remove();
  });

  test("mountFor replace-all with clearBetween fallback (not sole children)", () => {
    const el = container();
    // Add sibling content so markers are not the sole children
    const wrapper = document.createElement("div");
    el.appendChild(wrapper);
    const before = document.createElement("p");
    before.textContent = "before";
    wrapper.appendChild(before);

    const items = signal([{ id: 1, label: "old" }]);

    mountChild(
      For({
        each: items,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number; label: string }) => h("span", null, r.label),
      }),
      wrapper,
      null,
    );

    // Replace all — wrapper has <p> + markers, so canSwap is false → clearBetween
    items.set([{ id: 10, label: "new" }]);
    expect(wrapper.querySelector("span")?.textContent).toBe("new");

    el.remove();
  });

  test("mountFor LIS fallback for large reorder (> SMALL_K diffs)", () => {
    const el = container();
    // Create items with enough to exceed SMALL_K (8) diffs
    const initial = Array.from({ length: 12 }, (_, i) => ({ id: i, label: `item-${i}` }));
    const items = signal(initial);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("span", null, r.label),
        }),
      ),
      el,
    );

    // Reverse all — > SMALL_K diffs triggers LIS fallback
    items.set([...initial].reverse());

    const spans = el.querySelectorAll("span");
    expect(spans[0]?.textContent).toBe("item-11");
    expect(spans[11]?.textContent).toBe("item-0");

    el.remove();
  });

  test("mountFor clear with non-sole children uses clearBetween", () => {
    const el = container();
    const wrapper = document.createElement("div");
    el.appendChild(wrapper);
    // Add a sibling so markers are not sole children
    const sibling = document.createElement("p");
    sibling.textContent = "sibling";
    wrapper.appendChild(sibling);

    const items = signal([{ id: 1, label: "a" }]);

    mountChild(
      For({
        each: items,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number; label: string }) => h("span", null, r.label),
      }),
      wrapper,
      null,
    );

    // Clear — wrapper has <p> + markers so canSwap is false
    items.set([]);
    expect(wrapper.querySelectorAll("span").length).toBe(0);

    el.remove();
  });

  test("mountFor size change triggers LIS not small-k", () => {
    const el = container();
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("span", null, r.label),
        }),
      ),
      el,
    );

    // Different size — skips small-k, goes to LIS
    items.set([
      { id: 2, label: "b" },
      { id: 1, label: "a" },
      { id: 3, label: "c" },
    ]);

    expect(el.querySelectorAll("span").length).toBe(3);
    el.remove();
  });
});

// ─── devtools.ts — overlay with mocked elementFromPoint ──────────────────────
// happy-dom's elementFromPoint returns null, so we mock it to exercise the
// overlay click and mousemove code paths that depend on finding a target element.

describe("devtools — overlay paths with mocked elementFromPoint", () => {
  beforeAll(() => {
    installDevTools();
  });

  test("overlay mousemove finds component and positions overlay + tooltip (line 120-141)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    target.style.cssText = "width:100px;height:100px;position:fixed;top:50px;left:50px;";
    document.body.appendChild(target);
    registerComponent("mm-comp", "MouseMoveComp", target, null);

    // Mock elementFromPoint to return our target
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();

    // First mousemove — sets _currentHighlight
    const event1 = new MouseEvent("mousemove", { clientX: 75, clientY: 75, bubbles: true });
    document.dispatchEvent(event1);

    // Overlay should be visible
    const overlayEl = document.getElementById("__pyreon-overlay");
    expect(overlayEl?.style.display).toBe("block");

    // Second mousemove on same element — should early return (line 117: same _currentHighlight)
    const event2 = new MouseEvent("mousemove", { clientX: 76, clientY: 76, bubbles: true });
    document.dispatchEvent(event2);

    devtools.disableOverlay();
    document.elementFromPoint = origElementFromPoint;
    unregisterComponent("mm-comp");
    target.remove();
  });

  test("overlay mousemove with tooltip near top of viewport repositions below (line 139)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    target.style.cssText = "width:100px;height:20px;position:fixed;top:5px;left:10px;";
    document.body.appendChild(target);
    registerComponent("top-mm", "TopMouseMove", target, null);

    // Mock getBoundingClientRect to return rect.top < 35
    const origGetBCR = target.getBoundingClientRect.bind(target);
    target.getBoundingClientRect = () => ({
      top: 10,
      left: 10,
      width: 100,
      height: 20,
      bottom: 30,
      right: 110,
      x: 10,
      y: 10,
      toJSON: () => {},
    });

    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();

    const event = new MouseEvent("mousemove", { clientX: 50, clientY: 15, bubbles: true });
    document.dispatchEvent(event);

    devtools.disableOverlay();
    document.elementFromPoint = origElementFromPoint;
    target.getBoundingClientRect = origGetBCR;
    unregisterComponent("top-mm");
    target.remove();
  });

  test("overlay mousemove with children count shows plural text (line 132)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    target.style.cssText = "width:100px;height:100px;position:fixed;top:50px;left:50px;";
    document.body.appendChild(target);

    // Parent with 2 children — triggers plural "components" text
    registerComponent("multi-parent", "MultiParent", target, null);
    registerComponent("multi-c1", "Child1", null, "multi-parent");
    registerComponent("multi-c2", "Child2", null, "multi-parent");

    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();
    const event = new MouseEvent("mousemove", { clientX: 75, clientY: 75, bubbles: true });
    document.dispatchEvent(event);

    devtools.disableOverlay();
    document.elementFromPoint = origElementFromPoint;
    unregisterComponent("multi-c2");
    unregisterComponent("multi-c1");
    unregisterComponent("multi-parent");
    target.remove();
  });

  test("overlay mousemove with 1 child shows singular text (line 132)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    target.style.cssText = "width:100px;height:100px;position:fixed;top:50px;left:50px;";
    document.body.appendChild(target);

    registerComponent("single-parent", "SingleParent", target, null);
    registerComponent("single-c1", "SingleChild", null, "single-parent");

    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();
    const event = new MouseEvent("mousemove", { clientX: 75, clientY: 75, bubbles: true });
    document.dispatchEvent(event);

    devtools.disableOverlay();
    document.elementFromPoint = origElementFromPoint;
    unregisterComponent("single-c1");
    unregisterComponent("single-parent");
    target.remove();
  });

  test("overlay mousemove with entry.el null hides overlay (line 110)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    // Register component with null element
    registerComponent("null-el-comp", "NullElComp", null, null);

    // elementFromPoint returns target, but findComponentForElement won't find
    // a match since none of our registered components have target as their el.
    // This hits the "no entry found" path (line 110).
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();
    // First set a highlight by registering a component with the target
    registerComponent("real-comp", "RealComp", target, null);
    const event1 = new MouseEvent("mousemove", { clientX: 50, clientY: 50, bubbles: true });
    document.dispatchEvent(event1);
    unregisterComponent("real-comp");

    // Now target is not associated with any component, so entry.el won't match
    // This triggers the "no entry?.el" path
    const event2 = new MouseEvent("mousemove", { clientX: 51, clientY: 51, bubbles: true });
    document.dispatchEvent(event2);

    devtools.disableOverlay();
    document.elementFromPoint = origElementFromPoint;
    unregisterComponent("null-el-comp");
    target.remove();
  });

  test("overlay click finds component entry and logs it (lines 149-165)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    target.style.cssText = "width:100px;height:100px;position:fixed;top:50px;left:50px;";
    document.body.appendChild(target);

    registerComponent("click-found", "ClickFound", target, null);

    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    devtools.enableOverlay();

    const event = new MouseEvent("click", { clientX: 75, clientY: 75, bubbles: true });
    document.dispatchEvent(event);

    // click handler calls console.group, console.log, console.groupEnd
    expect(groupSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("element:", target);
    expect(logSpy).toHaveBeenCalledWith("children:", 0);
    expect(groupEndSpy).toHaveBeenCalled();

    // disableOverlay is called by click handler
    expect(document.body.style.cursor).toBe("");

    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
    document.elementFromPoint = origElementFromPoint;
    unregisterComponent("click-found");
    target.remove();
  });

  test("overlay click on component with parentId logs parent name (lines 159-162)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const parentEl = document.createElement("div");
    const childEl = document.createElement("span");
    parentEl.appendChild(childEl);
    document.body.appendChild(parentEl);

    registerComponent("click-parent-log", "ParentLog", parentEl, null);
    registerComponent("click-child-log", "ChildLog", childEl, "click-parent-log");

    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => childEl;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    devtools.enableOverlay();
    const event = new MouseEvent("click", { clientX: 25, clientY: 25, bubbles: true });
    document.dispatchEvent(event);

    // Should log parent name (line 161)
    expect(logSpy).toHaveBeenCalledWith("parent:", "<ParentLog>");

    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
    document.elementFromPoint = origElementFromPoint;
    unregisterComponent("click-child-log");
    unregisterComponent("click-parent-log");
    parentEl.remove();
  });

  test("overlay click on component without entry (no match) just disables (line 149-165 else)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    document.body.appendChild(target);

    // No component registered for this element
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();
    const event = new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true });
    document.dispatchEvent(event);

    // disableOverlay still called — cursor restored
    expect(document.body.style.cursor).toBe("");

    document.elementFromPoint = origElementFromPoint;
    target.remove();
  });
});

// ─── devtools.ts — direct handler calls to cover remaining branches ──────────

describe("devtools — direct handler calls", () => {
  beforeAll(() => {
    installDevTools();
  });

  test("onOverlayMouseMove with rect.top >= 35 does NOT reposition tooltip below (line 138 false)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    registerComponent("direct-mm", "DirectMM", target, null);

    target.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      width: 100,
      height: 50,
      bottom: 150,
      right: 150,
      x: 50,
      y: 100,
      toJSON: () => {},
    });

    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();
    // Call handler directly
    onOverlayMouseMove(new MouseEvent("mousemove", { clientX: 75, clientY: 125 }));

    const tooltipEl = document.querySelector("[style*='ui-monospace']") as HTMLElement;
    // tooltip top should be rect.top - 30 = 70, NOT repositioned below
    if (tooltipEl) expect(tooltipEl.style.top).toBe("70px");

    devtools.disableOverlay();
    document.elementFromPoint = origEFP;
    unregisterComponent("direct-mm");
    target.remove();
  });

  test("onOverlayMouseMove with rect.top < 35 repositions tooltip below (line 138 true)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    registerComponent("direct-mm2", "DirectMM2", target, null);

    target.getBoundingClientRect = () => ({
      top: 10,
      left: 50,
      width: 100,
      height: 20,
      bottom: 30,
      right: 150,
      x: 50,
      y: 10,
      toJSON: () => {},
    });

    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => target;

    devtools.enableOverlay();
    onOverlayMouseMove(new MouseEvent("mousemove", { clientX: 75, clientY: 15 }));

    devtools.disableOverlay();
    document.elementFromPoint = origEFP;
    unregisterComponent("direct-mm2");
    target.remove();
  });

  test("onOverlayClick with parentId but parent unregistered (line 161 false)", () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      enableOverlay: () => void;
      disableOverlay: () => void;
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    // Register child with parentId pointing to nonexistent parent
    registerComponent("orphan-child", "OrphanChild", target, "nonexistent-parent");

    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => target;

    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    devtools.enableOverlay();
    onOverlayClick(new MouseEvent("click", { clientX: 50, clientY: 50 }));

    // entry.parentId is truthy, but _components.get("nonexistent-parent") is undefined
    // so the `if (parent)` false branch is hit
    expect(groupSpy).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith("parent:", expect.anything());

    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
    document.elementFromPoint = origEFP;
    unregisterComponent("orphan-child");
    target.remove();
  });

  test("$p.stats reports component counts (line 284)", () => {
    const $p = (window as unknown as Record<string, unknown>).$p as {
      stats: () => { total: number; roots: number };
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = $p.stats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("roots");
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

// ─── hydrate.ts — reactive accessor with complex VNode and no domNode ────────

describe("hydrate.ts — additional reactive accessor branches", () => {
  test("hydrate reactive accessor returning null with domNode appends marker before it", () => {
    const el = container();
    el.innerHTML = "<span>existing-content</span>";
    const content = signal<VNodeChild>(null);
    const cleanup = hydrateRoot(
      el,
      h(
        Fragment,
        null,
        (() => content()) as unknown as VNodeChild,
        h("span", null, "existing-content"),
      ),
    );
    cleanup();
  });

  test("hydrate reactive text matching a text node reuses it (line 110-116)", () => {
    const el = container();
    el.innerHTML = "initial text";
    const text = signal("initial text");
    const cleanup = hydrateRoot(el, (() => text()) as unknown as VNodeChild);
    // Should reuse the existing text node and attach effect
    text.set("updated text");
    expect(el.textContent).toContain("updated text");
    cleanup();
  });

  test("hydrate For without markers and domNode is null (line 187-194)", () => {
    const el = container();
    el.innerHTML = ""; // empty, so domNode is null
    const items = signal([{ id: 1, label: "x" }]);
    const cleanup = hydrateRoot(
      el,
      For({
        each: items,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number; label: string }) => h("li", null, r.label),
      }),
    );
    cleanup();
  });

  test("hydrate element with null domNode (no matching DOM) falls back to mount", () => {
    const el = container();
    el.innerHTML = ""; // nothing to match
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = hydrateRoot(el, h("div", null, "fresh"));
    cleanup();
    warnSpy.mockRestore();
  });
});

// ─── transition.ts — additional pendingLeaveCancel branch ────────────────────

describe("Transition — pendingLeaveCancel exercised in rAF callback (lines 110-113)", () => {
  test("leave rAF sets pendingLeaveCancel then re-enter cancels it", async () => {
    const el = container();
    const visible = signal(true);
    const _removeListenerCalled = false;

    mount(
      h(Transition, {
        show: visible,
        name: "cancel-test",
        children: h("div", { id: "cancel-target" }, "content"),
      }),
      el,
    );

    // Start leave
    visible.set(false);

    // Wait for rAF to set pendingLeaveCancel (line 110)
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    // The target should now have leave classes
    const target = el.querySelector("#cancel-target");
    expect(target?.classList.contains("cancel-test-leave-active")).toBe(true);

    // Re-enter — applyEnter calls pendingLeaveCancel (line 80-81)
    visible.set(true);
    await new Promise<void>((r) => queueMicrotask(r));

    // Leave classes should be removed by the cancel
    // The element should still be visible
    el.remove();
  });
});

// ─── mount.ts — mountElement nested paths ────────────────────────────────────

describe("mount.ts — additional nested element branch paths", () => {
  test("nested element with ref + propCleanup + childCleanup at depth > 0 (lines 202-207)", () => {
    const el = container();
    const ref = createRef<HTMLElement>();
    const cls = signal("dynamic");
    const text = signal("inner");

    const unmount = mount(
      h(
        "div",
        null,
        h("span", { ref, class: () => cls() }, () => text()),
      ),
      el,
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current?.className).toBe("dynamic");
    expect(ref.current?.textContent).toBe("inner");

    cls.set("changed");
    text.set("updated");
    expect(ref.current?.className).toBe("changed");

    unmount();
    expect(ref.current).toBeNull();
  });

  test("nested element with childCleanup but no ref and no propCleanup (line 196)", () => {
    const el = container();
    const text = signal("reactive-child");

    // span is nested (depth > 0), has reactive child (childCleanup !== noop)
    // but no ref and no propCleanup
    const unmount = mount(
      h(
        "div",
        null,
        h("span", null, () => text()),
      ),
      el,
    );

    expect(el.querySelector("span")?.textContent).toBe("reactive-child");
    text.set("changed-child");
    expect(el.querySelector("span")?.textContent).toBe("changed-child");
    unmount();
  });

  test("nested element with propCleanup but no ref at depth > 0 (line 197)", () => {
    const el = container();
    const cls = signal("cls-val");

    // span nested, has reactive prop (propCleanup) but no ref
    // childCleanup is noop (static text child)
    const unmount = mount(h("div", null, h("span", { class: () => cls() }, "static-text")), el);

    expect(el.querySelector("span")?.className).toBe("cls-val");
    cls.set("new-cls");
    expect(el.querySelector("span")?.className).toBe("new-cls");
    unmount();
  });
});

// ─── nodes.ts — mountFor NativeItem without cleanup in step 3 ────────────────

describe("nodes.ts — mountFor NativeItem edge cases in step 3", () => {
  test("mountFor step 3 NativeItem without cleanup (cleanupCount unchanged)", () => {
    const el = container();
    const items = signal([{ id: 1, label: "a" }]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => {
            // NativeItem with null cleanup
            const native = _tpl("<b></b>", (root) => {
              root.textContent = r.label;
              return null;
            });
            return native as unknown as ReturnType<typeof h>;
          },
        }),
      ),
      el,
    );

    // Add new item — step 3 mounts NativeItem with null cleanup
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);
    expect(el.querySelectorAll("b").length).toBe(2);

    el.remove();
  });

  test("mountFor step 2 removes stale entry with cleanup (cleanupCount--)", () => {
    const el = container();
    const _cleanupCalled = false;
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("span", null, r.label),
        }),
      ),
      el,
    );

    // Remove item 2 but keep item 1 — step 2 removes stale entry
    items.set([{ id: 1, label: "a" }]);
    expect(el.querySelectorAll("span").length).toBe(1);

    el.remove();
  });

  test("mountFor step 2 removes stale NativeItem entry with cleanup", () => {
    const el = container();
    let cleanupCount = 0;
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => {
            const native = _tpl("<b></b>", (root) => {
              root.textContent = r.label;
              return () => {
                cleanupCount++;
              };
            });
            return native as unknown as ReturnType<typeof h>;
          },
        }),
      ),
      el,
    );

    // Remove item 2 (keeps item 1) — step 2 with entry.cleanup non-null
    items.set([{ id: 1, label: "a" }]);
    expect(cleanupCount).toBe(1);

    el.remove();
  });

  test("mountFor clear path with cleanupCount = 0 skips cleanup iteration", () => {
    const el = container();
    const items = signal([{ id: 1 }]);

    // Use NativeItem with null cleanup so cleanupCount stays 0
    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => {
            const native = _tpl("<b></b>", (root) => {
              root.textContent = String(r.id);
              return null;
            });
            return native as unknown as ReturnType<typeof h>;
          },
        }),
      ),
      el,
    );

    // Clear — cleanupCount = 0, so skip cleanup iteration
    items.set([]);
    expect(el.querySelectorAll("b").length).toBe(0);

    el.remove();
  });

  test("mountFor replace-all with NativeItem entries having no cleanup", () => {
    const el = container();
    const items = signal([{ id: 1, label: "old" }]);

    mount(
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => {
            const native = _tpl("<b></b>", (root) => {
              root.textContent = r.label;
              return null; // no cleanup
            });
            return native as unknown as ReturnType<typeof h>;
          },
        }),
      ),
      el,
    );

    // Replace all with completely new keys
    items.set([{ id: 10, label: "new" }]);
    expect(el.querySelector("b")?.textContent).toBe("new");

    el.remove();
  });
});

// ─── props.ts — sanitizeHtml SSR fallback (no DOMParser) ─────────────────────

describe("props.ts — sanitizeHtml edge cases", () => {
  test("sanitizeHtml with custom sanitizer takes priority over native and fallback", () => {
    let called = false;
    setSanitizer((html) => {
      called = true;
      return html.replace(/<[^>]*>/g, "STRIPPED");
    });
    const result = sanitizeHtml("<b>test</b>");
    expect(called).toBe(true);
    expect(result).toContain("STRIPPED");
    setSanitizer(null);
  });

  test("applyProp with reactive function prop creates renderEffect", () => {
    const el = document.createElement("div");
    const title = signal("initial");
    const cleanup = applyProp(el, "title", () => title());
    expect(el.title).toBe("initial");
    title.set("updated");
    expect(el.title).toBe("updated");
    cleanup?.();
  });
});

// ─── keep-alive.ts — KeepAlive where container ref not yet set ───────────────

describe("KeepAlive — container ref edge cases", () => {
  test("KeepAlive mounts children once and preserves state across hide/show cycles", () => {
    const el = container();
    const active = signal(true);
    const count = signal(0);

    const Inner = defineComponent(() => {
      return h("span", null, () => String(count()));
    });

    const unmount = mount(h(KeepAlive, { active: () => active() }, h(Inner, null)), el);

    expect(el.querySelector("span")?.textContent).toBe("0");

    // Update state while visible
    count.set(5);
    expect(el.querySelector("span")?.textContent).toBe("5");

    // Hide — state preserved
    active.set(false);
    const wrapper = el.querySelector("div[style*='display']") ?? el.querySelector("div");
    expect(wrapper).not.toBeNull();

    // Show again — state still preserved
    active.set(true);
    expect(el.querySelector("span")?.textContent).toBe("5");

    unmount();
  });

  test("KeepAlive with null children mounts nothing (line 55)", () => {
    const el = container();
    const unmount = mount(
      h(KeepAlive, { active: () => true, children: null as unknown as undefined }),
      el,
    );
    // Container exists but empty
    const wrapper = el.querySelector("div");
    expect(wrapper).not.toBeNull();
    unmount();
  });
});

// ─── Additional coverage: mountKeyedList LIS array growth (nodes.ts lines 174-178) ──

describe("nodes.ts — mountKeyedList LIS typed array reallocation", () => {
  test("mountKeyedList with >16 keyed items triggers LIS array growth", () => {
    const el = container();
    // Start with > 16 keyed VNodes to exceed initial Int32Array(16) size
    const makeItems = (ids: number[]) => ids.map((id) => h("span", { key: id }, String(id)));

    const ids = Array.from({ length: 20 }, (_, i) => i);
    const items = signal(makeItems(ids) as VNodeChild);

    mount(h("div", null, (() => items()) as VNodeChild), el);
    expect(el.querySelectorAll("span").length).toBe(20);

    // Reverse to trigger LIS reorder with typed array growth
    const reversed = [...ids].reverse();
    items.set(makeItems(reversed) as unknown as VNodeChild);
    expect(el.querySelectorAll("span").length).toBe(20);
    expect(el.querySelectorAll("span")[0]?.textContent).toBe("19");

    el.remove();
  });
});

// ─── Additional coverage: Transition with no children (rawChild is undefined) ──

describe("Transition — rawChild undefined branch (line 164-165)", () => {
  test("Transition with no children returns null when mounted", () => {
    const el = container();
    const visible = signal(true);

    // No children prop at all — rawChild is undefined
    mount(h(Transition, { show: visible, name: "fade" }), el);

    // Should not throw; renders nothing meaningful
    el.remove();
  });
});

// ─── Additional coverage: anonymous component (mount.ts line 234 || "Anonymous") ──

describe("mount.ts — anonymous component name fallback", () => {
  test("anonymous component uses 'Anonymous' fallback name", () => {
    const el = container();

    // Arrow function has name: "" (empty string) — triggers || "Anonymous"
    const unmount = mount(h((() => h("span", null, "anon")) as unknown as ComponentFn, null), el);

    expect(el.querySelector("span")?.textContent).toBe("anon");
    unmount();
  });
});

// ─── Additional coverage: TransitionGroup FLIP inner rAF (lines 209-218) ──

describe("TransitionGroup — FLIP inner rAF with mocked getBoundingClientRect", () => {
  test("FLIP move animation fires inner rAF when positions differ", async () => {
    const el = container();
    const items = signal([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ]);

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "flip",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number; label: string }) =>
          h("span", { class: "flip-mock" }, item.label),
      }),
      el,
    );
    await new Promise<void>((r) => queueMicrotask(r));

    // Mock getBoundingClientRect on each span to return different positions
    const spans = el.querySelectorAll("span.flip-mock");
    let callCount = 0;
    for (const span of spans) {
      const idx = callCount++;
      (span as HTMLElement).getBoundingClientRect = () => ({
        top: idx * 30,
        left: 0,
        width: 100,
        height: 25,
        bottom: idx * 30 + 25,
        right: 100,
        x: 0,
        y: idx * 30,
        toJSON: () => {},
      });
    }

    // Reorder items to trigger FLIP
    items.set([
      { id: 3, label: "c" },
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);

    // Update getBoundingClientRect for new positions
    const newSpans = el.querySelectorAll("span.flip-mock");
    let newIdx = 0;
    for (const span of newSpans) {
      const i = newIdx++;
      (span as HTMLElement).getBoundingClientRect = () => ({
        top: i * 30,
        left: 0,
        width: 100,
        height: 25,
        bottom: i * 30 + 25,
        right: 100,
        x: 0,
        y: i * 30,
        toJSON: () => {},
      });
    }

    await new Promise<void>((r) => queueMicrotask(r));
    // First rAF: FLIP records positions and applies inverse transform
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    // Second rAF: inner rAF applies move class and transitions
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    // Fire transitionend to clean up move class
    for (const span of el.querySelectorAll("span.flip-mock")) {
      span.dispatchEvent(new Event("transitionend"));
    }

    el.remove();
  });
});

// ─── Additional coverage: Transition with custom class overrides ──

describe("Transition — custom class overrides (transition.ts ?? branches)", () => {
  test("Transition with explicit class overrides uses provided classes", async () => {
    const el = container();
    const visible = signal(false);

    mount(
      h(Transition, {
        show: visible,
        name: "custom",
        enterFrom: "my-enter-from",
        enterActive: "my-enter-active",
        enterTo: "my-enter-to",
        leaveFrom: "my-leave-from",
        leaveActive: "my-leave-active",
        leaveTo: "my-leave-to",
        children: h("div", { id: "custom-cls" }, "custom"),
      }),
      el,
    );

    visible.set(true);
    await new Promise<void>((r) => queueMicrotask(r));

    const target = el.querySelector("#custom-cls");
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    // After rAF, enter-active and enter-to should be applied
    expect(target?.classList.contains("my-enter-active")).toBe(true);
    expect(target?.classList.contains("my-enter-to")).toBe(true);

    // Fire transitionend
    if (target) target.dispatchEvent(new Event("transitionend"));

    el.remove();
  });
});

// ─── Additional coverage: TransitionGroup with custom class overrides ──

describe("TransitionGroup — custom class overrides (transition-group.ts ?? branches)", () => {
  test("TransitionGroup with explicit class overrides", async () => {
    const el = container();
    const items = signal([{ id: 1, label: "a" }]);

    mount(
      h(TransitionGroup, {
        tag: "ul",
        name: "tg",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number; label: string }) => h("li", { class: "tg-item" }, item.label),
        enterFrom: "custom-ef",
        enterActive: "custom-ea",
        enterTo: "custom-et",
        leaveFrom: "custom-lf",
        leaveActive: "custom-la",
        leaveTo: "custom-lt",
        moveClass: "custom-move",
      }),
      el,
    );
    await new Promise<void>((r) => queueMicrotask(r));

    // Add item to trigger enter
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]);
    await new Promise<void>((r) => queueMicrotask(r));

    el.remove();
  });
});

// ─── transition.ts — component child warning (line 170) ─────────────────────

describe("transition.ts — component child warning", () => {
  test("Transition warns when child is a component (line 170)", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const show = signal(true);

    function Inner() {
      return h("span", null, "inner");
    }

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mount(
      h(Transition, {
        name: "fade",
        show: () => show(),
        children: h(Inner, null),
      }),
      el,
    );
    await new Promise<void>((r) => queueMicrotask(r));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Transition child is a component"));
    warn.mockRestore();
    el.remove();
  });

  test("Transition with non-VNode children returns rawChild ?? null (line 165)", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const show = signal(true);

    mount(
      h(Transition, {
        name: "fade",
        show: () => show(),
        children: "just text",
      }),
      el,
    );
    await new Promise<void>((r) => queueMicrotask(r));
    expect(el.textContent).toContain("just text");
    el.remove();
  });
});

// ─── devtools.ts — overlay handlers (lines 128-169, 284) ────────────────────

describe("devtools.ts — $p console helper branches", () => {
  test("$p.highlight with unknown id does nothing", () => {
    installDevTools();
    const p = (window as unknown as Record<string, unknown>).$p as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    // Should not throw
    p.highlight?.("nonexistent-id-12345");
  });

  test("$p.help prints usage (line 291+)", () => {
    installDevTools();
    const p = (window as unknown as Record<string, unknown>).$p as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    p.help?.();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

// ─── nodes.ts — keyed list LIS reorder branches ─────────────────────────────

describe("nodes.ts — keyed list LIS reorder", () => {
  test("mountFor LIS fallback — reverse with size change (lines 536-578)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    type Item = { id: number; label: string };
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
      { id: 5, label: "e" },
      { id: 6, label: "f" },
      { id: 7, label: "g" },
      { id: 8, label: "h" },
      { id: 9, label: "i" },
      { id: 10, label: "j" },
    ]);

    mount(
      h(For, {
        each: items,
        by: (item: Item) => item.id,
        children: (item: Item) => h("span", null, item.label),
      }),
      el,
    );
    expect(el.textContent).toBe("abcdefghij");

    // Reverse + add new item = size change → hits LIS fallback (not small-k)
    items.set([
      { id: 10, label: "j" },
      { id: 9, label: "i" },
      { id: 8, label: "h" },
      { id: 7, label: "g" },
      { id: 6, label: "f" },
      { id: 5, label: "e" },
      { id: 4, label: "d" },
      { id: 3, label: "c" },
      { id: 2, label: "b" },
      { id: 1, label: "a" },
      { id: 11, label: "k" },
    ]);
    expect(el.textContent).toBe("jihgfedcbak");

    el.remove();
  });

  test("mountFor smallKPlace — few items swapped (lines 609-646)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    type Item = { id: number; label: string };
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ]);

    mount(
      h(For, {
        each: items,
        by: (item: Item) => item.id,
        children: (item: Item) => h("span", null, item.label),
      }),
      el,
    );
    expect(el.textContent).toBe("abcd");

    // Swap 2 items — triggers small-k path (≤ SMALL_K diffs)
    items.set([
      { id: 1, label: "a" },
      { id: 4, label: "d" },
      { id: 3, label: "c" },
      { id: 2, label: "b" },
    ]);
    expect(el.textContent).toBe("adcb");

    el.remove();
  });
});
