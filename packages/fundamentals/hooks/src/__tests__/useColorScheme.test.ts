import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { useColorScheme } from "../useColorScheme";

describe("useColorScheme", () => {
  let changeListeners: Map<string, (e: MediaQueryListEvent) => void>;

  beforeEach(() => {
    mountCallbacks = [];
    unmountCallbacks = [];
    changeListeners = new Map();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === "change") changeListeners.set(query, cb);
        }),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("returns light by default", () => {
    const scheme = useColorScheme();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(scheme()).toBe("light");
  });

  it("returns dark when prefers-color-scheme is dark", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === "change") changeListeners.set(query, cb);
        }),
        removeEventListener: vi.fn(),
      })),
    });

    const scheme = useColorScheme();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(scheme()).toBe("dark");
  });

  it("updates when color scheme changes from light to dark", () => {
    const scheme = useColorScheme();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(scheme()).toBe("light");

    const listener = changeListeners.get("(prefers-color-scheme: dark)");
    listener?.({ matches: true } as MediaQueryListEvent);
    expect(scheme()).toBe("dark");
  });

  it("updates when color scheme changes from dark to light", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === "change") changeListeners.set(query, cb);
        }),
        removeEventListener: vi.fn(),
      })),
    });

    const scheme = useColorScheme();
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(scheme()).toBe("dark");

    const listener = changeListeners.get("(prefers-color-scheme: dark)");
    listener?.({ matches: false } as MediaQueryListEvent);
    expect(scheme()).toBe("light");
  });
});
