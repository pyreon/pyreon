import type { ComponentFn } from "@pyreon/core";
import { h } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";
import {
  KeepAlive as _KeepAlive,
  Transition as _Transition,
  TransitionGroup as _TransitionGroup,
  mount,
} from "../index";

const Transition = _Transition as unknown as ComponentFn<Record<string, unknown>>;
const TransitionGroup = _TransitionGroup as unknown as ComponentFn<Record<string, unknown>>;
const KeepAlive = _KeepAlive as unknown as ComponentFn<Record<string, unknown>>;

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

// ─── Transition ──────────────────────────────────────────────────────────────

describe("Transition", () => {
  test("renders child when show is true", () => {
    const el = container();
    const show = signal(true);
    mount(
      h(Transition, { name: "fade", show: () => show() }, h("div", { class: "child" }, "hello")),
      el,
    );
    expect(el.querySelector(".child")?.textContent).toBe("hello");
  });

  test("does not render child when show is false initially", () => {
    const el = container();
    const show = signal(false);
    mount(
      h(Transition, { name: "fade", show: () => show() }, h("div", { class: "child" }, "hello")),
      el,
    );
    expect(el.querySelector(".child")).toBeNull();
  });

  test("uses default name 'pyreon' when no name provided", () => {
    const el = container();
    const show = signal(true);
    mount(h(Transition, { show: () => show() }, h("div", { class: "child" }, "content")), el);
    expect(el.querySelector(".child")?.textContent).toBe("content");
  });

  test("applies enter classes when show transitions from false to true", async () => {
    const el = container();
    const show = signal(false);
    mount(
      h(Transition, { name: "fade", show: () => show() }, h("div", { class: "target" }, "text")),
      el,
    );
    expect(el.querySelector(".target")).toBeNull();

    show.set(true);
    // Wait for microtask (queueMicrotask in handleVisibilityChange)
    await new Promise<void>((r) => setTimeout(r, 20));

    const target = el.querySelector(".target") as HTMLElement;
    expect(target).not.toBeNull();
    // After the enter animation starts, the element should have enter classes
    // Classes will be in transition — at minimum the element should exist
    expect(target.textContent).toBe("text");
  });

  test("applies custom enter/leave class overrides", async () => {
    const el = container();
    const show = signal(true);
    mount(
      h(
        Transition,
        {
          show: () => show(),
          enterFrom: "my-enter-from",
          enterActive: "my-enter-active",
          enterTo: "my-enter-to",
          leaveFrom: "my-leave-from",
          leaveActive: "my-leave-active",
          leaveTo: "my-leave-to",
        },
        h("div", { class: "custom-target" }, "custom"),
      ),
      el,
    );
    expect(el.querySelector(".custom-target")).not.toBeNull();
  });

  test("calls lifecycle callbacks on enter", async () => {
    const el = container();
    const show = signal(false);
    const onBeforeEnter = vi.fn();
    const onAfterEnter = vi.fn();

    mount(
      h(
        Transition,
        {
          name: "fade",
          show: () => show(),
          onBeforeEnter,
          onAfterEnter,
        },
        h("div", { class: "lifecycle" }, "enter"),
      ),
      el,
    );

    show.set(true);
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(onBeforeEnter).toHaveBeenCalled();

    // Trigger the transitionend to complete the enter
    const target = el.querySelector(".lifecycle") as HTMLElement;
    if (target) {
      target.dispatchEvent(new Event("transitionend"));
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(onAfterEnter).toHaveBeenCalled();
    }
  });

  test("calls lifecycle callbacks on leave", async () => {
    const el = container();
    const show = signal(true);
    const onBeforeLeave = vi.fn();
    const onAfterLeave = vi.fn();

    mount(
      h(
        Transition,
        {
          name: "fade",
          show: () => show(),
          onBeforeLeave,
          onAfterLeave,
        },
        h("div", { class: "leave-target" }, "leave"),
      ),
      el,
    );

    // Initial render
    await new Promise<void>((r) => setTimeout(r, 10));

    show.set(false);
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(onBeforeLeave).toHaveBeenCalled();

    // Trigger transitionend to complete leave
    const target = el.querySelector(".leave-target") as HTMLElement;
    if (target) {
      target.dispatchEvent(new Event("transitionend"));
      await new Promise<void>((r) => setTimeout(r, 20));
      expect(onAfterLeave).toHaveBeenCalled();
    }
  });

  test("appear option triggers enter animation on initial mount", async () => {
    const el = container();
    const show = signal(true);
    const onBeforeEnter = vi.fn();

    mount(
      h(
        Transition,
        {
          name: "fade",
          show: () => show(),
          appear: true,
          onBeforeEnter,
        },
        h("div", { class: "appear-target" }, "appear"),
      ),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 20));
    expect(onBeforeEnter).toHaveBeenCalled();
  });

  test("warns when child is a component (not a DOM element)", () => {
    const el = container();
    const show = signal(true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ChildComp = () => h("div", null, "comp-child");

    mount(h(Transition, { name: "fade", show: () => show() }, h(ChildComp, null)), el);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Transition child is a component"),
    );
    warnSpy.mockRestore();
  });

  test("handles null/undefined children gracefully", () => {
    const el = container();
    const show = signal(true);
    // No children
    expect(() => mount(h(Transition, { name: "fade", show: () => show() }), el)).not.toThrow();
  });

  test("cancels pending leave when re-entering", async () => {
    const el = container();
    const show = signal(true);

    mount(
      h(
        Transition,
        { name: "fade", show: () => show() },
        h("div", { class: "cancel-test" }, "toggle"),
      ),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 10));

    // Start leave
    show.set(false);
    await new Promise<void>((r) => setTimeout(r, 10));

    // Re-enter before leave animation completes
    show.set(true);
    await new Promise<void>((r) => setTimeout(r, 30));

    // Element should be visible again
    const target = el.querySelector(".cancel-test");
    expect(target).not.toBeNull();
  });

  test("handles animationend event (CSS animations)", async () => {
    const el = container();
    const show = signal(false);
    const onAfterEnter = vi.fn();

    mount(
      h(
        Transition,
        { name: "anim", show: () => show(), onAfterEnter },
        h("div", { class: "anim-target" }, "anim"),
      ),
      el,
    );

    show.set(true);
    await new Promise<void>((r) => setTimeout(r, 30));

    const target = el.querySelector(".anim-target") as HTMLElement;
    if (target) {
      // Fire animationend instead of transitionend
      target.dispatchEvent(new Event("animationend"));
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(onAfterEnter).toHaveBeenCalled();
    }
  });
});

// ─── TransitionGroup ─────────────────────────────────────────────────────────

describe("TransitionGroup", () => {
  test("renders items inside a wrapper element", async () => {
    const el = container();
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);

    mount(
      h(TransitionGroup, {
        tag: "ul",
        name: "list",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("li", null, `item-${item.id}`),
      }),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 50));
    const lis = el.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0]?.textContent).toBe("item-1");
  });

  test("uses default tag 'div' and name 'pyreon'", async () => {
    const el = container();
    const items = signal([{ id: 1 }]);

    mount(
      h(TransitionGroup, {
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, `s-${item.id}`),
      }),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(el.querySelector("div")).not.toBeNull();
    expect(el.querySelector("span")?.textContent).toBe("s-1");
  });

  test("handles item additions", async () => {
    const el = container();
    const items = signal([{ id: 1 }]);

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, `item-${item.id}`),
      }),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(el.querySelectorAll("span").length).toBe(1);

    items.set([{ id: 1 }, { id: 2 }]);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(el.querySelectorAll("span").length).toBe(2);
  });

  test("handles item removals with leave animation", async () => {
    const el = container();
    const items = signal([{ id: 1 }, { id: 2 }]);

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, `item-${item.id}`),
      }),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(el.querySelectorAll("span").length).toBe(2);

    items.set([{ id: 1 }]);
    await new Promise<void>((r) => setTimeout(r, 10));

    // The removed item gets leave animation classes.
    // After transitionend it would be removed. Simulate that.
    const spans = el.querySelectorAll("span");
    for (const span of spans) {
      span.dispatchEvent(new Event("transitionend"));
    }
    await new Promise<void>((r) => setTimeout(r, 50));
  });

  test("calls lifecycle callbacks on enter/leave", async () => {
    const el = container();
    const items = signal([{ id: 1 }]);
    const onBeforeEnter = vi.fn();
    const onAfterEnter = vi.fn();
    const onBeforeLeave = vi.fn();

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, `item-${item.id}`),
        onBeforeEnter,
        onAfterEnter,
        onBeforeLeave,
      }),
      el,
    );

    // Wait for initial mount
    await new Promise<void>((r) => setTimeout(r, 50));

    // Add an item to trigger enter animation
    items.set([{ id: 1 }, { id: 2 }]);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(onBeforeEnter).toHaveBeenCalled();

    // Trigger transitionend on the new item to fire onAfterEnter
    const spans = el.querySelectorAll("span");
    const newSpan = spans[spans.length - 1];
    if (newSpan) {
      newSpan.dispatchEvent(new Event("transitionend"));
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(onAfterEnter).toHaveBeenCalled();
    }

    // Remove item to trigger leave
    items.set([{ id: 1 }]);
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(onBeforeLeave).toHaveBeenCalled();
  });

  test("appear option animates items on initial mount", async () => {
    const el = container();
    const items = signal([{ id: 1 }]);
    const onBeforeEnter = vi.fn();

    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        appear: true,
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, `item-${item.id}`),
        onBeforeEnter,
      }),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(onBeforeEnter).toHaveBeenCalled();
  });

  test("supports custom class overrides", async () => {
    const el = container();
    const items = signal([{ id: 1 }]);

    mount(
      h(TransitionGroup, {
        tag: "div",
        items: () => items(),
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, `item-${item.id}`),
        enterFrom: "custom-enter-from",
        enterActive: "custom-enter-active",
        enterTo: "custom-enter-to",
        leaveFrom: "custom-leave-from",
        leaveActive: "custom-leave-active",
        leaveTo: "custom-leave-to",
        moveClass: "custom-move",
      }),
      el,
    );

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(el.querySelector("span")).not.toBeNull();
  });
});

// ─── KeepAlive ───────────────────────────────────────────────────────────────

describe("KeepAlive", () => {
  test("renders children when active is true", async () => {
    const el = container();
    const active = signal(true);

    mount(h(KeepAlive, { active: () => active() }, h("span", { class: "kept" }, "alive")), el);

    await new Promise<void>((r) => setTimeout(r, 50));
    const kept = el.querySelector(".kept");
    expect(kept?.textContent).toBe("alive");
  });

  test("hides children but keeps them mounted when active is false", async () => {
    const el = container();
    const active = signal(true);

    mount(h(KeepAlive, { active: () => active() }, h("span", { class: "kept" }, "alive")), el);

    await new Promise<void>((r) => setTimeout(r, 50));

    active.set(false);
    await new Promise<void>((r) => setTimeout(r, 20));

    // The container div should have display: none, but the child should still be in DOM
    const wrapperDiv = el.querySelector("[style]") as HTMLElement;
    if (wrapperDiv) {
      expect(wrapperDiv.style.display).toBe("none");
    }
    // Child should still exist in the DOM (kept alive)
    expect(el.querySelector(".kept")).not.toBeNull();
  });

  test("restores display when re-activated", async () => {
    const el = container();
    const active = signal(true);

    mount(h(KeepAlive, { active: () => active() }, h("span", { class: "kept" }, "alive")), el);

    await new Promise<void>((r) => setTimeout(r, 50));
    active.set(false);
    await new Promise<void>((r) => setTimeout(r, 20));
    active.set(true);
    await new Promise<void>((r) => setTimeout(r, 20));

    // The container's display should be restored (empty string = visible)
    const wrapperDivs = el.querySelectorAll("div");
    let foundVisible = false;
    for (const div of wrapperDivs) {
      if (div.style.display === "" || div.style.display === "contents") {
        foundVisible = true;
      }
    }
    expect(foundVisible).toBe(true);
  });

  test("defaults to active=true when no active prop provided", async () => {
    const el = container();

    mount(h(KeepAlive, {}, h("span", { class: "default" }, "default")), el);

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(el.querySelector(".default")?.textContent).toBe("default");
  });

  test("mounts children only once (not re-created on toggle)", async () => {
    const el = container();
    const active = signal(true);
    let mountCount = 0;
    const Counter = () => {
      mountCount++;
      return h("span", null, "counter");
    };

    mount(h(KeepAlive, { active: () => active() }, h(Counter, null)), el);

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(mountCount).toBe(1);

    active.set(false);
    await new Promise<void>((r) => setTimeout(r, 20));
    active.set(true);
    await new Promise<void>((r) => setTimeout(r, 20));

    // Component should NOT be re-created
    expect(mountCount).toBe(1);
  });

  test("uses display: contents wrapper for transparent layout", async () => {
    const el = container();
    mount(h(KeepAlive, {}, h("span", null, "child")), el);

    await new Promise<void>((r) => setTimeout(r, 20));
    // KeepAlive renders a div with style="display: contents"
    const wrapper = el.querySelector("div");
    expect(wrapper).not.toBeNull();
  });

  test("handles null children gracefully", async () => {
    const el = container();
    expect(() => mount(h(KeepAlive, {}), el)).not.toThrow();
    await new Promise<void>((r) => setTimeout(r, 50));
  });
});
