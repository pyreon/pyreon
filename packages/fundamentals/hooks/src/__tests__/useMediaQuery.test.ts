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

import { useMediaQuery } from "../useMediaQuery";

describe("useMediaQuery", () => {
  let listeners: Map<string, (e: MediaQueryListEvent) => void>;
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mountCallbacks = [];
    unmountCallbacks = [];
    listeners = new Map();

    matchMediaMock = vi.fn((query: string) => {
      const mql = {
        matches: false,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === "change") listeners.set(query, cb);
        }),
        removeEventListener: vi.fn((event: string) => {
          if (event === "change") listeners.delete(query);
        }),
        dispatchEvent: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      };
      return mql;
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
  });

  it("returns false initially before mount", () => {
    const matches = useMediaQuery("(min-width: 768px)");
    expect(matches()).toBe(false);
  });

  it("returns the current match state after mount", () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: "(min-width: 768px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const matches = useMediaQuery("(min-width: 768px)");
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(matches()).toBe(true);
  });

  it("updates when media query changes", () => {
    const mql = {
      matches: false,
      media: "(min-width: 768px)",
      addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
        if (event === "change") listeners.set("(min-width: 768px)", cb);
      }),
      removeEventListener: vi.fn(),
    };
    matchMediaMock.mockReturnValue(mql);

    const matches = useMediaQuery("(min-width: 768px)");
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(matches()).toBe(false);

    // Simulate media query change
    const changeListener = listeners.get("(min-width: 768px)");
    changeListener?.({ matches: true } as MediaQueryListEvent);
    expect(matches()).toBe(true);
  });

  it("removes listener on unmount", () => {
    const removeEventListenerSpy = vi.fn();
    const mql = {
      matches: false,
      media: "(min-width: 768px)",
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerSpy,
    };
    matchMediaMock.mockReturnValue(mql);

    useMediaQuery("(min-width: 768px)");
    mountCallbacks.forEach((cb) => {
      cb();
    });
    unmountCallbacks.forEach((cb) => {
      cb();
    });

    expect(removeEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("passes the correct query string to matchMedia", () => {
    useMediaQuery("(prefers-color-scheme: dark)");
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(matchMediaMock).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  });

  it("updates from true to false on change", () => {
    const mql = {
      matches: true,
      media: "(min-width: 768px)",
      addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
        if (event === "change") listeners.set("q", cb);
      }),
      removeEventListener: vi.fn(),
    };
    matchMediaMock.mockReturnValue(mql);

    const matches = useMediaQuery("(min-width: 768px)");
    mountCallbacks.forEach((cb) => {
      cb();
    });
    expect(matches()).toBe(true);

    const changeListener = listeners.get("q");
    changeListener?.({ matches: false } as MediaQueryListEvent);
    expect(matches()).toBe(false);
  });
});
