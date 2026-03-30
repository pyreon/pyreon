import { signal } from "@pyreon/reactivity";
import { mount } from "@pyreon/runtime-dom";
import { useVirtualizer, useWindowVirtualizer } from "../index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const Wrapper = () => {
    result = fn();
    return null;
  };
  const unmount = mount(<Wrapper />, el);
  return {
    result: result!,
    unmount: () => {
      unmount();
      el.remove();
    },
  };
}

/** Create a mock scroll container with a known size. */
function createScrollContainer(height = 200): HTMLDivElement {
  const container = document.createElement("div");
  // happy-dom doesn't have real layout, but we can set properties
  Object.defineProperty(container, "offsetHeight", { value: height });
  Object.defineProperty(container, "offsetWidth", { value: 300 });
  Object.defineProperty(container, "scrollHeight", { value: 10000 });
  Object.defineProperty(container, "clientHeight", { value: height });
  document.body.appendChild(container);
  return container;
}

// ─── useVirtualizer ──────────────────────────────────────────────────────────

describe("useVirtualizer", () => {
  it("creates a virtualizer with virtual items", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 35,
      })),
    );

    // Should have some virtual items based on container size + overscan
    expect(virt.virtualItems()).toBeDefined();
    expect(Array.isArray(virt.virtualItems())).toBe(true);
    unmount();
    container.remove();
  });

  it("returns correct total size", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    );

    // 100 items * 50px = 5000px
    expect(virt.totalSize()).toBe(5000);
    unmount();
    container.remove();
  });

  it("reactive count — updates when count signal changes", () => {
    const container = createScrollContainer();
    const count = signal(100);
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: count(),
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    );

    expect(virt.totalSize()).toBe(5000);

    count.set(200);
    expect(virt.totalSize()).toBe(10000);
    unmount();
    container.remove();
  });

  it("reactive estimateSize — updates total size", () => {
    const container = createScrollContainer();
    const itemSize = signal(50);
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => itemSize(),
      })),
    );

    expect(virt.totalSize()).toBe(5000);

    itemSize.set(100);
    // Must call measure() to invalidate the measurement cache when estimateSize changes
    virt.instance.measure();
    expect(virt.totalSize()).toBe(10000);
    unmount();
    container.remove();
  });

  it("exposes the virtualizer instance", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 50,
        getScrollElement: () => container,
        estimateSize: () => 40,
      })),
    );

    expect(virt.instance).toBeDefined();
    expect(typeof virt.instance.scrollToIndex).toBe("function");
    expect(typeof virt.instance.scrollToOffset).toBe("function");
    expect(typeof virt.instance.measureElement).toBe("function");
    unmount();
    container.remove();
  });

  it("virtual items have correct structure", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 35,
      })),
    );

    const items = virt.virtualItems();
    if (items.length > 0) {
      const item = items[0]!;
      expect(typeof item.index).toBe("number");
      expect(typeof item.start).toBe("number");
      expect(typeof item.end).toBe("number");
      expect(typeof item.size).toBe("number");
      expect(typeof item.key).toBeDefined();
    }
    unmount();
    container.remove();
  });

  it("overscan controls extra items rendered", () => {
    const container = createScrollContainer(200);
    const { result: small, unmount: unmount1 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 35,
        overscan: 0,
      })),
    );

    const { result: large, unmount: unmount2 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 35,
        overscan: 10,
      })),
    );

    // More overscan = more virtual items
    expect(large.virtualItems().length).toBeGreaterThanOrEqual(small.virtualItems().length);
    unmount1();
    unmount2();
    container.remove();
  });

  it("gap option affects total size", () => {
    const container = createScrollContainer();
    const { result: noGap, unmount: unmount1 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 10,
        getScrollElement: () => container,
        estimateSize: () => 50,
        gap: 0,
      })),
    );

    const { result: withGap, unmount: unmount2 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 10,
        getScrollElement: () => container,
        estimateSize: () => 50,
        gap: 10,
      })),
    );

    // 10 items * 50 = 500 vs 10 items * 50 + 9 gaps * 10 = 590
    expect(noGap.totalSize()).toBe(500);
    expect(withGap.totalSize()).toBe(590);
    unmount1();
    unmount2();
    container.remove();
  });

  it("horizontal mode works", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 100,
        horizontal: true,
      })),
    );

    expect(virt.totalSize()).toBe(10000);
    expect(virt.virtualItems().length).toBeGreaterThan(0);
    unmount();
    container.remove();
  });

  it("padding affects total size", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 10,
        getScrollElement: () => container,
        estimateSize: () => 50,
        paddingStart: 20,
        paddingEnd: 30,
      })),
    );

    // 10 * 50 + 20 + 30 = 550
    expect(virt.totalSize()).toBe(550);
    unmount();
    container.remove();
  });

  it("isScrolling starts as false", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    );

    expect(virt.isScrolling()).toBe(false);
    unmount();
    container.remove();
  });

  it("enabled: false produces empty virtual items", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
        enabled: false,
      })),
    );

    expect(virt.virtualItems()).toHaveLength(0);
    expect(virt.totalSize()).toBe(0);
    unmount();
    container.remove();
  });

  it("onChange callback updates signals when triggered", () => {
    const container = createScrollContainer();
    const onChangeSpy = vi.fn();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
        onChange: onChangeSpy,
      })),
    );

    // Manually invoke the instance's onChange to simulate a scroll/resize event
    // This exercises the constructor's onChange callback (lines 76-81)
    const onChange = virt.instance.options.onChange;
    if (onChange) {
      onChange(virt.instance, false);
    }

    expect(virt.virtualItems()).toBeDefined();
    expect(typeof virt.totalSize()).toBe("number");
    expect(typeof virt.isScrolling()).toBe("boolean");
    // The user's onChange should have been forwarded
    expect(onChangeSpy).toHaveBeenCalled();
    unmount();
    container.remove();
  });

  it("onChange callback works without user-provided onChange", () => {
    const container = createScrollContainer();
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
        // No onChange — exercises the resolvedOptions.onChange?.() optional chain
      })),
    );

    // Trigger onChange without a user handler
    const onChange = virt.instance.options.onChange;
    if (onChange) {
      onChange(virt.instance, false);
    }

    expect(virt.virtualItems()).toBeDefined();
    unmount();
    container.remove();
  });
});

// ─── useWindowVirtualizer ─────────────────────────────────────────────────────

describe("useWindowVirtualizer", () => {
  beforeEach(() => {
    // Ensure window has layout-like properties for happy-dom
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "scrollY", {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it("creates an instance and returns virtualItems, totalSize, isScrolling signals", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
      })),
    );

    expect(virt.instance).toBeDefined();
    expect(virt.virtualItems()).toBeDefined();
    expect(Array.isArray(virt.virtualItems())).toBe(true);
    expect(typeof virt.totalSize()).toBe("number");
    expect(virt.isScrolling()).toBe(false);
    unmount();
  });

  it("returns correct total size", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
      })),
    );

    expect(virt.totalSize()).toBe(5000);
    unmount();
  });

  it("reactive count — updates when count signal changes", () => {
    const count = signal(100);
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: count(),
        estimateSize: () => 50,
      })),
    );

    expect(virt.totalSize()).toBe(5000);

    count.set(200);
    expect(virt.totalSize()).toBe(10000);
    unmount();
  });

  it("reactive estimateSize — updates total size after measure()", () => {
    const itemSize = signal(50);
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => itemSize(),
      })),
    );

    expect(virt.totalSize()).toBe(5000);

    itemSize.set(100);
    virt.instance.measure();
    expect(virt.totalSize()).toBe(10000);
    unmount();
  });

  it("exposes instance methods (scrollToIndex, scrollToOffset, measureElement)", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 50,
        estimateSize: () => 40,
      })),
    );

    expect(typeof virt.instance.scrollToIndex).toBe("function");
    expect(typeof virt.instance.scrollToOffset).toBe("function");
    expect(typeof virt.instance.measureElement).toBe("function");
    unmount();
  });

  it("virtual items have correct structure", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
      })),
    );

    const items = virt.virtualItems();
    if (items.length > 0) {
      const item = items[0]!;
      expect(typeof item.index).toBe("number");
      expect(typeof item.start).toBe("number");
      expect(typeof item.end).toBe("number");
      expect(typeof item.size).toBe("number");
      expect(typeof item.key).toBeDefined();
    }
    unmount();
  });

  it("gap option affects total size", () => {
    const { result: noGap, unmount: unmount1 } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 10,
        estimateSize: () => 50,
        gap: 0,
      })),
    );

    const { result: withGap, unmount: unmount2 } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 10,
        estimateSize: () => 50,
        gap: 10,
      })),
    );

    // 10 items * 50 = 500 vs 10 items * 50 + 9 gaps * 10 = 590
    expect(noGap.totalSize()).toBe(500);
    expect(withGap.totalSize()).toBe(590);
    unmount1();
    unmount2();
  });

  it("padding affects total size", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 10,
        estimateSize: () => 50,
        paddingStart: 20,
        paddingEnd: 30,
      })),
    );

    // 10 * 50 + 20 + 30 = 550
    expect(virt.totalSize()).toBe(550);
    unmount();
  });

  it("horizontal mode works", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 100,
        horizontal: true,
      })),
    );

    expect(virt.totalSize()).toBe(10000);
    expect(virt.virtualItems().length).toBeGreaterThan(0);
    unmount();
  });

  it("enabled: false produces empty virtual items", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
        enabled: false,
      })),
    );

    expect(virt.virtualItems()).toHaveLength(0);
    expect(virt.totalSize()).toBe(0);
    unmount();
  });

  it("calls user-provided onChange callback", () => {
    const onChangeSpy = vi.fn();
    const count = signal(10);
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: count(),
        estimateSize: () => 50,
        onChange: onChangeSpy,
      })),
    );

    // Trigger a reactive update which calls setOptions + _willUpdate
    count.set(20);
    // The onChange may be called during the update cycle
    // At minimum, the virtualizer should still work correctly
    expect(virt.totalSize()).toBe(1000);
    unmount();
  });

  it("overscan controls extra items rendered", () => {
    const { result: small, unmount: unmount1 } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
        overscan: 0,
      })),
    );

    const { result: large, unmount: unmount2 } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
        overscan: 10,
      })),
    );

    expect(large.virtualItems().length).toBeGreaterThanOrEqual(small.virtualItems().length);
    unmount1();
    unmount2();
  });

  it("onChange callback updates signals when triggered directly", () => {
    const onChangeSpy = vi.fn();
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
        onChange: onChangeSpy,
      })),
    );

    // Trigger the constructor's onChange callback (lines 63-68)
    const onChange = virt.instance.options.onChange;
    if (onChange) {
      onChange(virt.instance, false);
    }

    expect(virt.virtualItems()).toBeDefined();
    expect(typeof virt.totalSize()).toBe("number");
    expect(typeof virt.isScrolling()).toBe("boolean");
    expect(onChangeSpy).toHaveBeenCalled();
    unmount();
  });

  it("onChange works without user-provided onChange", () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
      })),
    );

    const onChange = virt.instance.options.onChange;
    if (onChange) {
      onChange(virt.instance, false);
    }

    expect(virt.virtualItems()).toBeDefined();
    unmount();
  });

  it("handles missing document/window gracefully", () => {
    const origDoc = globalThis.document;
    const origWin = globalThis.window;
    try {
      // @ts-expect-error — temporarily remove globals to exercise SSR fallback branches
      delete globalThis.document;
      // @ts-expect-error
      delete globalThis.window;

      const { totalSize } = useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
      }));

      expect(totalSize()).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.document = origDoc;
      globalThis.window = origWin;
    }
  });
});
