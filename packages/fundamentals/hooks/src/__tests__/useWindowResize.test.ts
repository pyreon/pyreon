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

import { useWindowResize } from "../useWindowResize";

describe("useWindowResize", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    mountCallbacks = [];
    unmountCallbacks = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "innerWidth", { writable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { writable: true, value: originalInnerHeight });
  });

  it("returns initial window dimensions", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 768 });

    const size = useWindowResize();
    expect(size().width).toBe(1024);
    expect(size().height).toBe(768);
  });

  it("updates dimensions after resize with throttle", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 768 });

    const size = useWindowResize(200);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    // Simulate resize
    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 600 });
    window.dispatchEvent(new Event("resize"));

    // Should not update immediately
    expect(size().width).toBe(1024);

    // After throttle period
    vi.advanceTimersByTime(200);
    expect(size().width).toBe(800);
    expect(size().height).toBe(600);
  });

  it("throttles rapid resize events", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 768 });

    const size = useWindowResize(100);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    // First resize triggers timer
    window.dispatchEvent(new Event("resize"));

    // Second resize within throttle window should be ignored
    Object.defineProperty(window, "innerWidth", { writable: true, value: 500 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 400 });
    window.dispatchEvent(new Event("resize"));

    // After throttle, should use current window dimensions
    vi.advanceTimersByTime(100);
    expect(size().width).toBe(500);
    expect(size().height).toBe(400);
  });

  it("uses default throttle of 200ms", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 768 });

    const size = useWindowResize();
    mountCallbacks.forEach((cb) => {
      cb();
    });

    Object.defineProperty(window, "innerWidth", { writable: true, value: 800 });
    window.dispatchEvent(new Event("resize"));

    vi.advanceTimersByTime(100);
    expect(size().width).toBe(1024); // Still throttled

    vi.advanceTimersByTime(100);
    expect(size().width).toBe(800); // Now updated
  });

  it("cleans up on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    useWindowResize();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    unmountCallbacks.forEach((cb) => {
      cb();
    });

    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("clears pending timer on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 });

    useWindowResize(200);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    // Trigger a resize to start the timer
    window.dispatchEvent(new Event("resize"));

    unmountCallbacks.forEach((cb) => {
      cb();
    });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
