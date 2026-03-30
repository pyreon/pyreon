import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mountCallbacks: Array<() => unknown> = [];
let unmountCallbacks: Array<() => void> = [];

vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(fn);
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn);
  },
}));

import { useBreakpoint } from "../useBreakpoint";

describe("useBreakpoint", () => {
  const originalInnerWidth = window.innerWidth;
  let rafCallback: FrameRequestCallback | undefined;

  beforeEach(() => {
    mountCallbacks = [];
    unmountCallbacks = [];
    rafCallback = undefined;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      /* no-op */
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: originalInnerWidth });
    vi.restoreAllMocks();
  });

  it("returns the active breakpoint based on window width", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    const bp = useBreakpoint();
    expect(bp()).toBe("md"); // 768 <= 800 < 992
  });

  it("uses default breakpoints", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 400 });
    const bp = useBreakpoint();
    expect(bp()).toBe("xs"); // 0 <= 400 < 576

    Object.defineProperty(window, "innerWidth", { writable: true, value: 600 });
    const bp2 = useBreakpoint();
    expect(bp2()).toBe("sm"); // 576 <= 600 < 768
  });

  it("supports custom breakpoints", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 500 });
    const bp = useBreakpoint({ mobile: 0, tablet: 600, desktop: 1024 });
    expect(bp()).toBe("mobile");
  });

  it("returns largest matching breakpoint", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1200 });
    const bp = useBreakpoint();
    expect(bp()).toBe("xl");
  });

  it("returns first breakpoint for very small widths", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 0 });
    const bp = useBreakpoint();
    expect(bp()).toBe("xs");
  });

  it("updates breakpoint on resize", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    const bp = useBreakpoint();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(bp()).toBe("md");

    // Simulate resize
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1200 });
    window.dispatchEvent(new Event("resize"));

    // Execute rAF callback
    rafCallback?.(0);
    expect(bp()).toBe("xl");
  });

  it("debounces resize with requestAnimationFrame", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    const bp = useBreakpoint();
    mountCallbacks.forEach((cb) => {
      cb();
    });

    Object.defineProperty(window, "innerWidth", { writable: true, value: 1200 });
    window.dispatchEvent(new Event("resize"));

    // Before rAF fires, value should still be old
    expect(bp()).toBe("md");

    rafCallback?.(0);
    expect(bp()).toBe("xl");
  });

  it("cancels pending rAF on new resize", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    useBreakpoint();
    mountCallbacks.forEach((cb) => {
      cb();
    });

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("cleans up on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    useBreakpoint();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    unmountCallbacks.forEach((cb) => {
      cb();
    });

    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("does not update when breakpoint has not changed", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    const bp = useBreakpoint();
    mountCallbacks.forEach((cb) => {
      cb();
    });

    // Resize but stay within same breakpoint
    Object.defineProperty(window, "innerWidth", { writable: true, value: 850 });
    window.dispatchEvent(new Event("resize"));
    rafCallback?.(0);

    expect(bp()).toBe("md"); // Still md (768-991)
  });
});
